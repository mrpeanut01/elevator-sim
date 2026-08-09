/**
 * **Every building in `data/buildings/`, through the viewer's own spec path — list derived from
 * disk.**
 *
 * This suite exists because of what issue #108 actually was. `authoring/buildingSpec.ts` declared
 * `SpecTransportMode.traversalTimeS` as `number` while `config/schema.ts` declares a **union** —
 * a scalar for an escalator, `{ upS, downS }` for a stair, because climbing costs more than
 * descending and the schema refuses to symmetrise it. `st-jude-hospital` ships the second arm. So
 * `?building=st-jude-hospital` reached `toFixed` on an object and the whole viewer died before a
 * frame was drawn.
 *
 * **Nothing in the suite noticed, and the reason is the finding worth keeping.** `authoring.test.ts`
 * already round-trips *"every shipped building"* — over a **hand-written five-name list local to
 * that file**, written when five buildings shipped. Eight ship now, and the three it does not name
 * are `chancery-house`, `crown-hotel` and `st-jude-hospital`: the file's own comments still say
 * *"asserted over all five"*. A hand-written list of the things a breadth test covers stops being a
 * breadth test on the day something is added, **silently**, which is [§ D152](../../../DECISIONS.md)
 * one layer over and the reason [§ D192](../../../DECISIONS.md)'s dead-code audit derives its
 * nineteen directories from `readdirSync` instead of naming them.
 *
 * So this file names nothing. It reads the directory, and asserts the pinned list in
 * `fixtures.test-helper.ts` matches **both ways** — a building on disk that the pinned list omits
 * is red, and a pinned name with no file is red — so the next building to land arrives inside the
 * sweep rather than beside it.
 *
 * ## What it asserts, and why each one is here rather than assumed
 *
 * 1. **The spec path does not throw.** `specFromBuilding` → `buildingFromSpec` is what
 *    `dev/state.ts` runs on boot for whichever id the query string names. That call is the crash.
 * 2. **The rebuilt document still loads.** `parseBuilding` → `resolveBuilding` over the emitted
 *    building. A round trip that survives the editor and is then refused by the loader is the same
 *    defect with a longer fuse: it is what emitting a stair's `{ upS, downS }` while dropping its
 *    `kind` would have produced.
 * 3. **No surface prints a shape it cannot read.** Every emitted `$comment`, every `validateSpec`
 *    problem and every chip label is swept for `[object Object]`, `NaN` and `undefined`. This is
 *    the *generic* instrument for the class: `validateSpec` had a second, quieter instance of the
 *    same bug — `{ upS, downS } > 0` is `NaN > 0`, so a perfectly good stair fell through the
 *    guard and was reported as taking `[object Object] s` to ride — and no assertion about
 *    `traversalTimeS` in particular would have found it.
 * 4. **The union arm is genuinely exercised.** A sweep over eight buildings that all happen to be
 *    on the scalar arm would pass on the unfixed code, so the suite asserts that at least one
 *    shipped building declares the directional form and names it in the failure message. If the
 *    stair ever leaves `data/`, this goes red and says so rather than quietly becoming a no-op.
 * 5. **The refusal is pinned by a run, not by a sentence.** § D227: a control that cannot write
 *    something must say so. `withTransportSeconds` is driven at a stair and the pair is required to
 *    be *unchanged*, and `transportNoteOf` is required to say the control is disabled — the two
 *    halves of the standing requirement, in the refusing direction.
 *
 * It is deliberately **not** a rendering test. `dev/main.ts` mounts the DOM and cannot run here
 * (`boundaries.test.ts` confines the DOM to `dev/`, which is what keeps the rest of the package
 * testable under Node); what is driven is every pure function between the shipped JSON and the
 * strings that mount would set. The bootstrap itself is covered by `dev/boot.browser.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  expandFloors,
  parseBuilding,
  parseElevatorSpecs,
  resolveBuilding,
  type ElevatorSpecs,
} from '@elevator-sim/core/browser';

import {
  buildingFromSpec,
  specFromBuilding,
  transportModesOf,
  traversalTimeLabel,
  validateSpec,
  withTransportSeconds,
  type BuildingSpec,
} from './authoring/buildingSpec.js';
import { transportChoicesOf, transportNoteOf } from './dev/buildingEditor.js';
import { BUILDING_IDS, DATA_DIR } from './fixtures.test-helper.js';

const BUILDINGS_DIR = join(DATA_DIR, 'buildings');

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

/**
 * The shipped building ids, **from the directory**.
 *
 * `readdirSync` rather than a literal, for the reason in this file's header. `README.md` is the one
 * non-JSON entry and is filtered by extension rather than by name, so a second document alongside
 * it does not need this line edited.
 */
const SHIPPED: readonly string[] = readdirSync(BUILDINGS_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  .sort((a, b) => a.localeCompare(b));

const SPECS: ElevatorSpecs = parseElevatorSpecs(read(join(DATA_DIR, 'elevator-specs.json')));

/** Shapes a reader must never be shown, whichever surface produced the string. */
const UNREADABLE = /\[object Object\]|NaN|undefined/;

describe('the shipped building list is read from disk, not written down', () => {
  it('finds buildings at all, so an empty sweep cannot pass as a green one', () => {
    // Without this, a wrong `BUILDINGS_DIR` would make every `describe.each` below vacuous and the
    // suite would report success over nothing — the failure mode a derived list otherwise invites.
    expect(SHIPPED.length).toBeGreaterThan(1);
  });

  it('agrees with the pinned list in both directions', () => {
    /*
     * Both directions, which is the whole technique: `toEqual` on sorted arrays fails on a building
     * that landed in `data/` without being pinned **and** on a pinned name whose file is gone. A
     * one-directional check (`every shipped id is pinned`) is the check that let issue #108 through
     * in `authoring.test.ts` — its list was a subset of the directory and nothing said so.
     */
    expect(SHIPPED).toEqual([...BUILDING_IDS].sort((a, b) => a.localeCompare(b)));
  });
});

describe.each(SHIPPED)('%s — the viewer can open it', (id) => {
  const config = parseBuilding(read(join(BUILDINGS_DIR, `${id}.json`)));

  it('reads into a spec and back out into a building the loader accepts', () => {
    /*
     * The crash, and the refusal one layer past it. `dev/state.ts` runs the first line on boot for
     * whichever building the query string names; the second is what a reader gets when they press
     * download. Both were red on `st-jude-hospital` before issue #108 was fixed — the first with
     * `mode.traversalTimeS.toFixed is not a function`, the second with the schema refusing a
     * directional traversal time on a mode whose `kind` the round trip had dropped.
     */
    let spec: BuildingSpec | undefined;
    expect(() => (spec = specFromBuilding(config, id)), id).not.toThrow();
    expect(spec, id).toBeDefined();
    const rebuilt = buildingFromSpec(spec as BuildingSpec, { specs: SPECS });
    expect(() => resolveBuilding(parseBuilding(rebuilt as unknown), SPECS), id).not.toThrow();
  });

  it('keeps every floor id the document declares, including any below the lobby', () => {
    /*
     * **The floor id is the key every other part of a document names a floor by** — `servesFloors`,
     * `accessZones[].floors`, `transportModes[].connects` — so a round trip that renumbers the
     * floors has silently rewritten all three, and each of them means something different about
     * the building.
     *
     * It was renumbering three of the eight. `BuildingSpec`'s floor vocabulary had no room below
     * the lobby, so `specFromBuilding` dealt a basement the first slot *above* it and every floor
     * in the building moved up one: `crown-hotel`'s `back-of-house` zone went in naming `B1` and
     * came out naming `2`, which is a guest bedroom floor, and `st-jude-hospital`'s main stair went
     * in joining `G` to `1` and came out joining `G` to `3`. `midtown-office` lost its `P1` outright
     * — it is flagged `isEntrance`, and every entrance was folded onto the lobby.
     *
     * Asserted over the whole directory rather than over the three, because the five with no floor
     * beneath the lobby are the arms that would keep passing if the vocabulary lost it again. The
     * entrance flags are asserted beside the ids for the same reason `population` is not: a
     * misplaced entrance is a street door in the wrong place, which changes where people arrive,
     * while a flattened population is § 4.5's declared loss.
     */
    const source = expandFloors(config);
    const rebuilt = buildingFromSpec(specFromBuilding(config, id), { specs: SPECS });
    const written = rebuilt.floors ?? [];
    expect(written.map((floor) => floor.id), id).toStrictEqual(source.map((floor) => floor.id));
    expect(
      written.filter((floor) => floor.isEntrance === true).map((floor) => floor.id),
      id,
    ).toStrictEqual(source.filter((floor) => floor.isEntrance === true).map((floor) => floor.id));
    /*
     * And a floor the document put below datum stays below it. The id alone would pass on a
     * building that kept the name `B1` and hung it off the first floor above the lobby, which is
     * the shape the defect actually had.
     */
    const belowById = new Map(source.map((floor) => [floor.id, floor.heightM < 0]));
    expect(
      written.filter((floor) => floor.heightM < 0).map((floor) => floor.id),
      id,
    ).toStrictEqual(source.filter((floor) => belowById.get(floor.id) === true).map((floor) => floor.id));
  });

  it('carries every transport mode through the round trip on the arm it was authored on', () => {
    /*
     * Structural equality, not `toBe`: the directional arm is an object, and a comparison that only
     * held for numbers would pass on the very shape this suite exists for. `kind` and `use` are
     * asserted beside it because they are what make the pair legal — a document that kept the two
     * times and lost the kind is one `parseBuilding` refuses.
     */
    const source = config.transportModes ?? [];
    const written = transportModesOf(specFromBuilding(config, id));
    expect(written.map((mode) => mode.id), id).toStrictEqual(source.map((mode) => mode.id));
    expect(written.map((mode) => mode.traversalTimeS), id).toStrictEqual(
      source.map((mode) => mode.traversalTimeS),
    );
    expect(written.map((mode) => mode.kind), id).toStrictEqual(source.map((mode) => mode.kind));
    expect(written.map((mode) => mode.use), id).toStrictEqual(source.map((mode) => mode.use));
  });

  it('says nothing about it in a shape a reader cannot read', () => {
    /*
     * The generic instrument. Every string this building can put in front of somebody — the JSON
     * provenance the editor writes, the warnings under the elevation, the chips over the landing
     * pickers and the sentence under them — swept for the three shapes that mean a formatter met a
     * value it did not expect. `validateSpec`'s traversal-time guard was reported by exactly this:
     * `NaN > 0` is `false`, so a stair fell through it and was described as taking
     * `[object Object] s` to ride.
     */
    const spec = specFromBuilding(config, id);
    const said = [
      ...transportModesOf(spec).map((mode) => mode.$comment ?? ''),
      ...validateSpec(spec, undefined),
      ...transportChoicesOf(spec, '').map(
        (choice) => `${choice.lowerId} ${choice.upperId} ${traversalTimeLabel(choice.seconds)}`,
      ),
      transportNoteOf(spec),
    ];
    expect(said.filter((line) => UNREADABLE.test(line)), id).toStrictEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The directional arm, and the control that refuses it — issue #108, § D227
 * -------------------------------------------------------------------------- */

/** Every shipped mode whose traversal time is the `{ upS, downS }` arm, with the building it is in. */
const DIRECTIONAL = SHIPPED.flatMap((id) =>
  (parseBuilding(read(join(BUILDINGS_DIR, `${id}.json`))).transportModes ?? [])
    .filter((mode) => typeof mode.traversalTimeS !== 'number')
    .map((mode) => ({ id, modeId: mode.id })),
);

describe('the directional traversal time is a shipped shape, not a hypothetical', () => {
  it('is declared by at least one building, so the sweep above is not a no-op', () => {
    /*
     * The arm that crashed is only covered while something on disk is on it. If the stair ever
     * leaves `data/buildings/`, every assertion above keeps passing over eight scalars and this one
     * goes red — which is the difference between coverage and the appearance of it.
     */
    expect(
      DIRECTIONAL,
      'no shipped building declares traversalTimeS as { upS, downS }, so the union arm that ' +
        'issue #108 crashed on is no longer exercised by any test above',
    ).not.toStrictEqual([]);
  });

  it('is labelled with both directions named, never as a bare pair of numbers', () => {
    /*
     * `26.0 / 19.0 s` was the issue's suggestion and is deliberately not what ships. The asymmetry
     * *is* the modelling content — `transportModeSchema` refuses a scalar on a stair for exactly
     * that reason — so a label that prints two numbers without saying which is the climb hands the
     * reader back the symmetric stair the schema just refused to let anyone author.
     */
    expect(traversalTimeLabel(21.2)).toBe('21.2 s');
    expect(traversalTimeLabel({ upS: 26, downS: 19 })).toBe('26.0 s up / 19.0 s down');
  });
});

describe.each(DIRECTIONAL)(
  'the seconds control refuses $modeId in $id rather than truncating it',
  ({ id, modeId }) => {
    const spec = specFromBuilding(parseBuilding(read(join(BUILDINGS_DIR, `${id}.json`))), id);

    it('leaves both times exactly as they were when the control is driven', () => {
      /*
       * § D177's rule pointed the other way: **move the control and require the run NOT to
       * change**, because the honest answer here is that it cannot write this field. The failure
       * this pins is the plausible one — clamping the typed number onto `traversalTimeS` and
       * dropping `downS`, which reads as a working control and deletes the descent.
       */
      const before = spec.transportModes.find((mode) => mode.id === modeId)?.traversalTimeS;
      expect(before, modeId).not.toBe(undefined);
      expect(typeof before, modeId).toBe('object');
      const after = withTransportSeconds(spec, modeId, 42).find((mode) => mode.id === modeId);
      expect(after?.traversalTimeS, modeId).toStrictEqual(before);
    });

    it('says so on the note beside it, rather than only in a docstring', () => {
      // The other half of § D227. A refusal nobody is shown is a control that silently does nothing.
      const said = transportNoteOf(spec);
      expect(said, id).toMatch(/stair/);
      expect(said, id).toMatch(/disabled/);
    });
  },
);
