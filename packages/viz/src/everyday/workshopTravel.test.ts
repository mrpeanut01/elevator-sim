/**
 * **The workshop's controls against the run they claim to reach** — GitHub issue #296.
 *
 * ## The one thing this file is for
 *
 * `CLAUDE.md`'s standing requirement is *move the control and require the run to change, compared
 * on the legs rather than on a window statistic*, and § D227 binds it in both directions: a control
 * that writes nothing must say so, and a control that writes something may not claim it writes
 * nothing. Issue #296 is the first half's mirror image and the more expensive one — the workshop's
 * thirteen term sliders, three behaviour flags and three of its four plain levers write
 * `viewer.dispatcherSpec`, which `dev/state.ts#drivingProfileOf` does not read, under a § 3.3
 * footer that read *Unsaved changes travel with the run.*
 *
 * So every case below measures a control **through the shipped path** —
 * `shiftRunConfigOf` → `recordRun`, `scope/probes.test-helper.ts`'s own `legsOf`, which is the
 * helper that reproduces `dev/main.ts#runShift`'s call rather than an abbreviation of it — and then
 * requires the sentence the screen would draw about that control to agree with what was measured.
 * **Neither half is asserted alone.** A test that only measured the legs would have been green
 * before this lane and after it; a test that only checked the sentence would be
 * `workshopScreen.browser.test.ts`'s old case, which asserted on the printed cost expression and
 * was green while the run ignored every weight in it.
 *
 * ## Why the agreement is asserted rather than the outcome
 *
 * No case here says *the weights must not reach the run*. That is not a property worth freezing —
 * issues #228 and #167 are open and either could give the draft a way across, at which point the
 * right answer flips. What is frozen is that `scope/surface.ts`'s classification, the note the
 * screen selects, and the legs a run produces are **three statements of one fact**. Re-scope the
 * field and every case here still passes, with the note having changed itself; wire the field and
 * leave the scope table alone, and the first block goes red naming the control.
 *
 * That is the gap this file also closes on the way past: `scope/scope.test.ts` iterates
 * `entry.kind === 'control'` and never drives a `latent` row, so `viewer.dispatcherSpec`'s
 * declaration had been a claim in a table pinned by no run at all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEVERS,
  specFromProfile,
  type DispatcherSpec,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import { applyPlainLever, plainLeversOf, type PlainLeverId } from '../mode/plainLevers.js';
import { commitmentOf } from '../scope/commitment.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { SCOPE_OF } from '../scope/surface.js';
import type { SurfaceKey } from '../scope/types.js';
import { profileById, type ViewerState } from '../dev/state.js';

import {
  WORKSHOP_WRITES,
  workshopReachOf,
  workshopWriteReachesRun,
  type WorkshopWrite,
} from './workshopModel.js';

/* -------------------------------------------------------------------------- *
 * The operating point
 * -------------------------------------------------------------------------- */

/**
 * `midtown-office` rather than the helper's own Garden Apartments, and the choice is the issue's.
 *
 * Issue #296 measured at `midtown-office`, 900 s, seed 20260827, `collective` — 429 legs — and a
 * lane re-measuring a filed defect somewhere else has verified a different claim. It also matters
 * for the one control that *does* travel: `lobby` writes `idle.parkingStrategy: 'lobby'`, and a
 * parking strategy needs enough cars idle at once to have somewhere to be sent.
 */
const AT: Readonly<{ buildingId: string; shiftLengthS: number; dispatcherId: string }> =
  Object.freeze({ buildingId: 'midtown-office', shiftLengthS: 900, dispatcherId: 'collective' });

function workshopState(): ViewerState {
  const base = baseState();
  const profile = profileById(RESOURCES, [], AT.dispatcherId);
  return {
    ...base,
    buildingId: AT.buildingId,
    shiftLengthS: AT.shiftLengthS,
    dispatcherId: AT.dispatcherId,
    editingDispatcherId: AT.dispatcherId,
    // The draft the screen opens on, seeded exactly as `initialState` seeds it.
    dispatcherSpec: specFromProfile(profile, profile.name),
    levers: DEFAULT_LEVERS,
  };
}

/** `host.ts#setPlainLever`'s own write, verbatim — the route the screen's four levers take. */
function withLever(at: ViewerState, id: PlainLeverId, value: number | boolean): ViewerState {
  const applied = applyPlainLever(at.dispatcherSpec, at.levers, id, value);
  return { ...at, dispatcherSpec: applied.spec, levers: applied.levers };
}

/**
 * Which of {@link WORKSHOP_WRITES} a lever moved, decided by identity rather than by a table.
 *
 * `applyPlainLever` returns the field it did not touch **by reference** — its own docstring makes
 * that the property (*"only the owned field differs from what went in"*), and `plainLevers.test.ts`
 * deep-compares the rest. So `!==` here is the ownership map read off the function itself, and a
 * lever that quietly acquired a second write would be caught by the same comparison rather than by
 * this file needing to have heard about it.
 */
function keyMovedBy(before: ViewerState, after: ViewerState): WorkshopWrite {
  const specMoved = before.dispatcherSpec !== after.dispatcherSpec;
  const leversMoved = before.levers !== after.levers;
  if (specMoved && leversMoved) {
    throw new Error('a plain lever wrote both the draft and the group levers — see keyMovedBy');
  }
  if (specMoved) return 'viewer.dispatcherSpec';
  if (leversMoved) return 'viewer.levers';
  throw new Error('a plain lever wrote neither field');
}

/**
 * The levers the screen draws, in its own order — read from the model, never listed here.
 *
 * `mode/plainLevers.ts#PLAIN_LEVER_IDS` is module-private, and `plainLeversOf` is what
 * `workshopScreen.ts` renders from, so deriving the list from it means this file drives exactly
 * the controls a player is offered. A fifth lever becomes a case rather than an omission — the
 * shape `familyControls.test.ts` uses one directory over, for the same reason.
 */
const LEVER_IDS: readonly PlainLeverId[] = plainLeversOf(
  workshopState().dispatcherSpec,
  DEFAULT_LEVERS,
).map((view) => view.id);

/** The two ends of each lever's travel — a slider at both stops, a toggle both ways. */
const ENDS: Readonly<Record<PlainLeverId, readonly [number | boolean, number | boolean]>> =
  Object.freeze({
    patience: [0, 100],
    room: [0, 100],
    lobby: [false, true],
    spread: [false, true],
  });

/* -------------------------------------------------------------------------- *
 * 1 — the standing requirement, per control, in both of its directions
 * -------------------------------------------------------------------------- */

describe('every plain lever’s scope declaration agrees with the legs it produces', () => {
  for (const id of LEVER_IDS) {
    it(`${id}: what scope/surface.ts says it reaches is what the run does`, () => {
      const base = workshopState();
      const [low, high] = ENDS[id];
      const atLow = withLever(base, id, low);
      const atHigh = withLever(base, id, high);
      const key = keyMovedBy(base, atHigh);

      const movesTheRun = legsOf(atLow) !== legsOf(atHigh);
      expect(
        movesTheRun,
        `the ${id} lever writes ${key}, which scope/surface.ts declares ` +
          `${workshopWriteReachesRun(key) ? 'as reaching a run' : 'latent'} — and the legs say ` +
          `${movesTheRun ? 'it moved the run' : 'the run is byte-identical'}. One of the two is ` +
          'wrong, and the note everyday/workshopScreen.ts draws above the primary is derived from ' +
          'the first, so the player is being told the wrong thing either way (GitHub issue #296)',
      ).toBe(workshopWriteReachesRun(key));
    });
  }

  /**
   * The measurement issue #296 filed, kept as a fact rather than as a property.
   *
   * The case above would pass if every lever reached the run and every declaration said so — which
   * is what fixing #228 might produce, and is a state this file deliberately does not forbid. This
   * one records what is true **today**, so that a wave which changes it has to come here and say so
   * rather than changing it silently: three of the four write the draft, one writes the levers, and
   * they are not the same lever the guide's footer used to describe.
   */
  it('is the split the issue measured — one lever travels and three do not', () => {
    const base = workshopState();
    const travels: PlainLeverId[] = [];
    const stays: PlainLeverId[] = [];
    for (const id of LEVER_IDS) {
      const [, high] = ENDS[id];
      (legsOf(withLever(base, id, high)) === legsOf(base) ? stays : travels).push(id);
    }
    expect({ travels: [...travels].sort(), stays: [...stays].sort() }).toEqual({
      travels: ['lobby'],
      stays: ['patience', 'room', 'spread'],
    });
  });
});

describe('the draft is latent on the legs, which scope.test.ts never drives', () => {
  /**
   * Every cost term and every behaviour flag, driven — the widened half of #296's measurement.
   *
   * `scope/scope.test.ts` iterates `entry.kind === 'control'`, so no `latent` row has ever been run
   * at either end. `viewer.dispatcherSpec`'s classification was therefore a sentence in a table
   * with nothing behind it, which is the same species as the claim it was used to justify. This is
   * the run behind it.
   */
  it('every weight and every flag leaves the legs byte-identical', () => {
    const base = workshopState();
    const control = legsOf(base);
    const spec: DispatcherSpec = base.dispatcherSpec;
    const moved: string[] = [];

    for (const termId of Object.keys(spec.weights)) {
      const at = { ...base, dispatcherSpec: { ...spec, weights: { ...spec.weights, [termId]: 100 } } };
      if (legsOf(at) !== control) moved.push(`weights.${termId}`);
    }
    const flags = spec.flags as unknown as Record<string, boolean>;
    for (const key of Object.keys(flags)) {
      const at = { ...base, dispatcherSpec: { ...spec, flags: { ...spec.flags, [key]: !flags[key] } } };
      if (legsOf(at) !== control) moved.push(`flags.${key}`);
    }

    /*
     * Conditional on the declaration rather than hard-coded to *nothing moved*, for the reason the
     * file docstring gives: the day `viewer.dispatcherSpec` becomes a control this expectation
     * inverts by itself, and a hard-coded empty list would have to be found and edited by hand.
     */
    if (workshopWriteReachesRun('viewer.dispatcherSpec')) {
      expect(moved, 'viewer.dispatcherSpec is declared a control and moved no leg').not.toEqual([]);
    } else {
      expect(
        moved,
        'viewer.dispatcherSpec is declared latent and these fields moved the run — the scope table ' +
          'is now wrong, and everyday/workshopScreen.ts is drawing a refusal about a live control',
      ).toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — the note the screen selects agrees with the classification
 * -------------------------------------------------------------------------- */

describe('no reach a latent-only edit can produce claims the edit travels', () => {
  /** Every subset of the four writes, as a bitmask — sixteen, so none is the one nobody tried. */
  function subsets(): readonly (readonly WorkshopWrite[])[] {
    const all: (readonly WorkshopWrite[])[] = [];
    for (let mask = 0; mask < 1 << WORKSHOP_WRITES.length; mask += 1) {
      all.push(WORKSHOP_WRITES.filter((_key, index) => (mask & (1 << index)) !== 0));
    }
    return all;
  }

  it('answers travels only when every standing write reaches a run', () => {
    for (const moved of subsets()) {
      const reach = workshopReachOf(moved);
      const reaching = moved.filter((key) => workshopWriteReachesRun(key));
      const staying = moved.filter((key) => !workshopWriteReachesRun(key));
      const expected =
        moved.length === 0
          ? 'nothing'
          : staying.length === 0
            ? 'travels'
            : reaching.length === 0
              ? 'draft-only'
              : 'split';
      expect(
        reach,
        `with ${JSON.stringify(moved)} standing, the bar would say "${reach}" — and ` +
          `${String(staying.length)} of those writes reach no run`,
      ).toBe(expected);
    }
  });

  it('never answers nothing or travels while a latent write is standing', () => {
    for (const moved of subsets()) {
      const staying = moved.filter((key) => !workshopWriteReachesRun(key));
      if (staying.length === 0) continue;
      expect(
        workshopReachOf(moved),
        `${JSON.stringify(staying)} reaches no run and the bar would still claim the edit ` +
          'travelled — GitHub issue #296 exactly',
      ).not.toBe('travels');
      expect(workshopReachOf(moved)).not.toBe('nothing');
    }
  });

  /**
   * The false negative, which issue #296 does not name and which § D227 rates as the worse half.
   *
   * The boolean this replaced was `ruleRows.length > 0 || specIsDirty(workingSpec, source)`. It did
   * not consult `viewer.levers` at all, so moving *lobby* — the one lever that really does change
   * the run — left the draft pristine and the footer read *Nothing changed yet.* A bar that denies
   * the only edit that landed is the stale refusal aimed at the working control, and it is why the
   * fix is a four-state answer rather than a corrected sentence.
   */
  it('answers travels for a lever-only edit, which the old boolean called nothing', () => {
    expect(workshopReachOf(['viewer.levers'])).toBe('travels');
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — every Everyday-writable latent field is accounted for
 * -------------------------------------------------------------------------- */

const SOURCE_OF = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

/**
 * The `ViewerState` keys any Everyday host method patches, read off `host.ts`.
 *
 * One regex over the object-literal keys of every `applyPatch({ … })` in the file, rather than a
 * per-method attribution: the question this block asks is *what can Everyday Mode write at all*,
 * and a spread patch (`{ ...next }`) that this cannot see makes the derived set **smaller**, which
 * is the safe direction for a check whose failure is *an unaccounted latent field*.
 */
/**
 * The object literal after `applyPatch({`, brace-matched rather than read to the first `}`.
 *
 * A `[^}]*` capture was written first and it was quietly wrong in the way that matters here: it
 * stops inside `savedPatterns: [...state.savedPatterns, { id, spec: named }]` and never reaches the
 * `pattern: id` two lines below, so the one patch in this file that realises its own latent field
 * looked as though it did not. An instrument that reads half a patch reports the defect it was
 * built to find, which is the failure `probes.test-helper.ts` calls *the false accusation an
 * instrument like this one is most dangerous for*.
 */
function patchBodies(source: string): readonly string[] {
  const bodies: string[] = [];
  const opener = 'applyPatch({';
  for (let at = source.indexOf(opener); at !== -1; at = source.indexOf(opener, at + 1)) {
    let depth = 0;
    let cursor = at + opener.length - 1;
    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(source.slice(at + opener.length, cursor));
  }
  return bodies;
}

/** The top-level keys of one patch body — nested object literals are stripped first. */
function patchKeys(body: string): readonly SurfaceKey[] {
  // Depth-0 text only, so `{ id, spec: named }` inside a value cannot contribute a key.
  let depth = 0;
  let flat = '';
  for (const char of body) {
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (depth === 0) flat += char;
    if ((char === '{' || char === '[' || char === '(') && depth === 1) flat += ' ';
  }
  const keys: SurfaceKey[] = [];
  for (const field of flat.matchAll(/(?:^|[,\s])([a-zA-Z][a-zA-Z0-9]*)\s*:/g)) {
    const key = `viewer.${field[1] ?? ''}` as SurfaceKey;
    if (key in SCOPE_OF) keys.push(key);
  }
  return keys;
}

function everydayPatches(): readonly (readonly SurfaceKey[])[] {
  return patchBodies(SOURCE_OF('./host.ts'))
    .map((body) => patchKeys(body))
    .filter((keys) => keys.length > 0);
}

function everydayWrittenKeys(): ReadonlySet<SurfaceKey> {
  return new Set(everydayPatches().flat());
}

/**
 * Whether a latent write is realised by the very press that makes it.
 *
 * This is the distinction that keeps the block below an instrument rather than an accusation, and
 * it was put here because the first run of it **found one and the find was wrong**.
 * `viewer.savedPatterns` is `latent`, `everyday/host.ts#applyPatternSpec` writes it, and the check
 * flagged it — but that method patches `savedPatterns`, `pattern` and `patternSpec` in **one**
 * object, and `viewer.savedPatterns`' own `realisedBy` is `viewer.pattern`. So the save and the
 * selection are the same press, the pattern really does reach the next run, and there is no
 * sentence anywhere claiming otherwise. That is `dev/trafficEditor.ts`'s stated rule working —
 * *"a pattern the run cannot be pointed at is the dead seam this repository keeps finding"* — not
 * a second copy of issue #296.
 *
 * `viewer.dispatcherSpec` is the shape that is left: `realisedBy` is `viewer.savedDispatchers`, and
 * **nothing in `everyday/` writes that field at all**, so no press in this product realises the
 * draft it lets a player build.
 */
function realisedInTheSamePatch(key: SurfaceKey): boolean {
  const entry = SCOPE_OF[key];
  if (entry === undefined || entry.kind !== 'latent') return false;
  const patches = everydayPatches().filter((keys) => keys.includes(key));
  return patches.length > 0 && patches.every((keys) => keys.includes(entry.realisedBy));
}

describe('an Everyday control over a latent field is covered by a screen that discloses it', () => {
  it('finds the fields Everyday can write, so the check is measuring something', () => {
    const written = everydayWrittenKeys();
    /*
     * A floor rather than an exact set. The derivation cannot see a spread patch and is not meant
     * to; what it must not do is silently find nothing, which is the shape of the page-error probe
     * that reported zero while measuring zero. Four is the workshop's own writes, which are all
     * spelled out at their call sites.
     */
    expect(
      [...written].sort(),
      'the derivation over host.ts found no writable field — it is measuring nothing',
    ).toEqual(expect.arrayContaining([...WORKSHOP_WRITES].sort()));
  });

  it('every latent field Everyday can write is realised by the press, or disclosed by a bar', () => {
    const latent = [...everydayWrittenKeys()].filter(
      (key) => commitmentOf(key, 'writes-only') === 'draft',
    );
    // The find that is worth having: this must not be empty, or the two arms below are vacuous.
    expect(latent.length, 'no Everyday write is latent — the check has nothing to decide').toBeGreaterThan(0);

    const uncovered = latent.filter(
      (key) =>
        !realisedInTheSamePatch(key) && !(WORKSHOP_WRITES as readonly string[]).includes(key),
    );
    expect(
      uncovered.sort(),
      'an Everyday control writes a field scope/surface.ts declares latent, no press realises it, ' +
        'and no screen’s § 3.3 note knows about it — so that screen’s bar is free to tell the ' +
        'player the edit travelled. That is GitHub issue #296 arriving in a second place. Either ' +
        'write the field’s own realisedBy in the same patch (applyPatternSpec’s shape), or give ' +
        'the field a row in WORKSHOP_WRITES and the screen a note derived from workshopReachOf',
    ).toEqual([]);
  });

  /**
   * The draft is the one that is neither realised nor, before this lane, disclosed.
   *
   * Pinned as a fact rather than left implicit in the block above, because it is the whole of
   * issue #296 in one line: `viewer.dispatcherSpec`'s `realisedBy` is `viewer.savedDispatchers`,
   * and no press in `everyday/` writes that field. If a lane ever gives Everyday a save, this case
   * is where it will fail, and the message is the instruction.
   */
  it('names the draft as the field no Everyday press realises', () => {
    expect(
      realisedInTheSamePatch('viewer.dispatcherSpec'),
      'an Everyday press now realises the dispatcher draft — issues #228 and #167 are the save ' +
        'gap, and if one has landed then WORKSHOP_COPY.yoursEmpty’s "no save here yet" and the ' +
        '§ 3.3 draft note are both stale and must be re-read',
    ).toBe(false);
  });

  it('WORKSHOP_WRITES is what the workshop screen writes, in both directions', () => {
    const screen = SOURCE_OF('./workshopScreen.ts');
    const host = SOURCE_OF('./host.ts');
    const called = new Set([...screen.matchAll(/\bapi\.(set[A-Za-z]+)\(/g)].map((m) => m[1] ?? ''));
    expect(called.size, 'no host writer call found in workshopScreen.ts').toBeGreaterThan(0);

    const reached = new Set<SurfaceKey>();
    for (const method of called) {
      // The method's implementation block, up to the next sibling key at the same indent.
      const body = new RegExp(`\\n    ${method}: \\([^)]*\\) => \\{([\\s\\S]*?)\\n    \\},`).exec(host);
      for (const patch of patchBodies(body?.[1] ?? '')) {
        for (const key of patchKeys(patch)) reached.add(key);
      }
    }
    expect(
      [...reached].sort(),
      'the fields workshopScreen.ts can write no longer match WORKSHOP_WRITES — a control was ' +
        'added or removed and the § 3.3 note is now describing a different set of edits than the ' +
        'screen makes',
    ).toEqual([...WORKSHOP_WRITES].sort());
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — the levers the screen draws are the levers this file measured
 * -------------------------------------------------------------------------- */

describe('the ownership map this file reads off applyPlainLever', () => {
  it('gives every lever exactly one owned field, and both fields are workshop writes', () => {
    const base = workshopState();
    const owners = new Map<PlainLeverId, WorkshopWrite>();
    for (const id of LEVER_IDS) {
      const [, high] = ENDS[id];
      owners.set(id, keyMovedBy(base, withLever(base, id, high)));
    }
    expect(owners.size).toBe(LEVER_IDS.length);
    for (const key of owners.values()) {
      expect(
        (WORKSHOP_WRITES as readonly string[]).includes(key),
        `a plain lever writes ${key}, which is not one of the four fields the § 3.3 note reasons ` +
          'about — the note would say nothing about moving it',
      ).toBe(true);
    }
  });

  it('does not let a lever write the group levers and the draft at once', () => {
    // `keyMovedBy` throws on a two-field write; this is that throw asserted rather than assumed,
    // because a silent second write is how one lever becomes two controls wearing one label.
    const base = workshopState();
    const both: GroupLevers = { ...base.levers, parking: !base.levers.parking };
    expect(() =>
      keyMovedBy(base, {
        ...base,
        levers: both,
        dispatcherSpec: { ...base.dispatcherSpec, weights: { ...base.dispatcherSpec.weights, starvation: 7 } },
      }),
    ).toThrow(/wrote both/u);
  });
});
