/**
 * W4's model, checked against a schema the product does not ship — and then against the one it
 * does, for completeness rather than for genericity.
 *
 * The order of the two `describe` blocks is the argument. **Everything that claims the form is
 * generic is asserted against `orchardSpace()`**, whose five dimensions are about fruit; the
 * shipped space appears only where the claim is about *coverage* — that every declared id gets a
 * control — which is a statement about the real schema and can only be made against it.
 *
 * `docs/10` § 11 W4's acceptance clauses, and where each is:
 *
 * | clause | test |
 * |---|---|
 * | every id in `collectSearchSpace().ids` is reachable in the editor | *"draws one control for every declared id"* |
 * | …and the list is derived from the function, not from a fixture | the same test: it reads `space.ids`, and a second asserts the count is not hard-coded |
 * | a weight on a term whose `activeWhen` is unsatisfied is refused **at the control**, with the reason | *"refuses an edit to a gated-off dimension, and names the gate"* |
 * | liveness: add a fictional schema row and watch the control appear with no UI change | *"a schema this product does not ship renders four kinds and two gate forms"* |
 */

import { describe, expect, it } from 'vitest';

import { DISPATCH_PARAMETERS } from '@elevator-sim/core/browser';
import { collectSearchSpace, discoverParameterSchemas } from '@elevator-sim/experiments/browser';
import type { SearchSpace } from '@elevator-sim/experiments/browser';

import { collectFormSource, formStatusLine } from '../dev/parameterForm.js';

import {
  applyControlEdit,
  candidateOf,
  controlsFor,
  defaultValues,
  describeCondition,
  resetControl,
} from './controls.js';
import { ORCHARD_PARAMETERS, orchardSpace } from './fictionalSchema.test-helper.js';
import { renderUnsearchable } from './render.js';

describe('the form is generated, and the evidence is a schema this product does not ship', () => {
  it('draws one control of the right kind for every row of a fictional schema', () => {
    const space = orchardSpace();
    const controls = controlsFor(space, defaultValues(space));

    // Five rows in, five controls out, and the kinds come off `type` alone.
    expect(controls.map((control) => [control.id, control.kind])).toEqual([
      ['orchard.irrigation', 'select'],
      ['orchard.litresPerTree', 'slider'],
      ['orchard.pickersOnShift', 'stepper'],
      ['orchard.nightHarvest', 'checkbox'],
      ['orchard.lanternCount', 'stepper'],
    ]);

    // Gate order, not declaration order: `lanternCount` is declared last and stays last because
    // both of its gates precede it, and `litresPerTree` follows the `irrigation` row it depends
    // on. A reader who flips a gate finds what it unlocked below the switch they threw.
    expect(controls.map((control) => control.id)).toEqual([...space.ids]);
  });

  it('takes every visible property off the declaration', () => {
    const space = orchardSpace();
    const controls = controlsFor(space, defaultValues(space));
    const litres = controls.find((control) => control.id === 'orchard.litresPerTree');

    expect(litres).toBeDefined();
    expect(litres?.label).toBe('litresPerTree');
    expect(litres?.section).toBe('orchard');
    expect(litres?.unit).toBe('L');
    expect(litres?.help).toContain('log scale');
    if (litres?.kind !== 'slider') throw new Error('expected a slider');
    expect([litres.min, litres.max, litres.scale, litres.reset]).toEqual([0.5, 400, 'log', 12]);
  });

  it('disables a gated-off dimension rather than hiding it, and says why', () => {
    const space = orchardSpace();
    // `nightHarvest` is false by default, so `lanternCount` is gated off — on that condition and
    // not on the other, because `pickersOnShift` defaults to 6 and the gate wants at least 4.
    const controls = controlsFor(space, defaultValues(space));
    const lanterns = controls.find((control) => control.id === 'orchard.lanternCount');

    expect(lanterns).toBeDefined();
    expect(lanterns?.enabled).toBe(false);
    expect(lanterns?.unmetGates).toEqual(['orchard.nightHarvest']);
    expect(lanterns?.inactiveReason).toBe(
      'needs orchard.nightHarvest to be true — it is false',
    );
    // Disabled, and still drawn: docs/10 § 8.1 disables-with-reason rather than hides.
    expect(controls).toHaveLength(space.ids.length);
  });

  it('reports both halves of a conjunction when both are unmet', () => {
    const space = orchardSpace();
    const thin = new Map(defaultValues(space)).set('orchard.pickersOnShift', 2);
    const lanterns = controlsFor(space, thin).find(
      (control) => control.id === 'orchard.lanternCount',
    );

    expect(lanterns?.unmetGates).toEqual(['orchard.nightHarvest', 'orchard.pickersOnShift']);
    expect(lanterns?.inactiveReason).toBe(
      'needs orchard.nightHarvest to be true — it is false; and needs orchard.pickersOnShift to be at least 4 — it is 2',
    );
  });

  it('a gate flipped on activates its dependants with no other edit', () => {
    const space = orchardSpace();
    const before = defaultValues(space);
    expect(
      controlsFor(space, before).find((c) => c.id === 'orchard.lanternCount')?.enabled,
    ).toBe(false);

    const edit = applyControlEdit(space, before, 'orchard.nightHarvest', true);
    expect(edit.accepted).toBe(true);
    if (!edit.accepted) throw new Error('unreachable');

    const after = controlsFor(space, edit.values);
    expect(after.find((c) => c.id === 'orchard.lanternCount')?.enabled).toBe(true);
    expect(after.find((c) => c.id === 'orchard.lanternCount')?.inactiveReason).toBeUndefined();
    // …and nothing else moved. One write.
    expect(edit.values.get('orchard.litresPerTree')).toBe(12);
  });

  it('drops inactive dimensions from the candidate and keeps them in the form state', () => {
    const space = orchardSpace();
    const values = defaultValues(space);

    expect(values.has('orchard.lanternCount')).toBe(true);
    expect(candidateOf(space, values).has('orchard.lanternCount')).toBe(false);
    // Search semantics — "absence means inactive" — are not widened by the form's convenience.
    expect([...candidateOf(space, values).keys()]).toEqual([
      'orchard.irrigation',
      'orchard.litresPerTree',
      'orchard.pickersOnShift',
      'orchard.nightHarvest',
    ]);
  });

  it('remembers what a control held while its gate was off', () => {
    const space = orchardSpace();
    const on = applyControlEdit(space, defaultValues(space), 'orchard.nightHarvest', true);
    if (!on.accepted) throw new Error('unreachable');
    const set = applyControlEdit(space, on.values, 'orchard.lanternCount', 40);
    if (!set.accepted) throw new Error('unreachable');
    const off = applyControlEdit(space, set.values, 'orchard.nightHarvest', false);
    if (!off.accepted) throw new Error('unreachable');

    // Gated off, so it is out of the candidate…
    expect(candidateOf(space, off.values).has('orchard.lanternCount')).toBe(false);
    // …and the control still shows 40 beside its reason, rather than silently resetting to 0.
    const lanterns = controlsFor(space, off.values).find(
      (control) => control.id === 'orchard.lanternCount',
    );
    expect(lanterns?.enabled).toBe(false);
    expect(lanterns?.kind === 'stepper' ? lanterns.value : undefined).toBe(40);
  });
});

/* -------------------------------------------------------------------------- *
 * The other end of every gate — issue #79, § D252
 * -------------------------------------------------------------------------- */

describe('a control that gates others says so, from the same declarations', () => {
  /**
   * Every edge the fictional schema declares, read straight off `ORCHARD_PARAMETERS` rather than
   * written out here.
   *
   * The test is only worth anything if the expected set is derived: a hand-written *"these three
   * gate something"* is the second list this whole feature exists to avoid, and it would keep
   * passing after somebody added a sixth row with a gate on it.
   */
  const declaredGates = (): ReadonlyMap<string, readonly string[]> => {
    const edges = new Map<string, string[]>();
    for (const row of ORCHARD_PARAMETERS) {
      for (const gate of Object.keys((row as { activeWhen?: object }).activeWhen ?? {})) {
        edges.set(gate, [...(edges.get(gate) ?? []), row.id]);
      }
    }
    return edges;
  };

  it('marks exactly the controls that gate something, whatever the current point', () => {
    /*
     * **The clause the issue asks for, and it is asserted in both directions over the whole
     * space** — a field that appeared on everything would read as a success on the one row a
     * single-control test looks at. It is checked at four different points, because the *presence*
     * of the mark is structural while its two halves are not: `unlocks` and `holdsOpen` partition
     * a control's dependants, so their total is the dependant count and does not move as the
     * reader edits. That is what stops the badge vanishing at the moment somebody throws a switch.
     */
    const space = orchardSpace();
    const gates = declaredGates();
    const points = [
      defaultValues(space),
      new Map(defaultValues(space)).set('orchard.nightHarvest', true),
      new Map(defaultValues(space)).set('orchard.pickersOnShift', 2),
      new Map(defaultValues(space)).set('orchard.irrigation', 'none'),
    ];
    for (const values of points) {
      for (const control of controlsFor(space, values)) {
        const governed = [...control.unlocks, ...control.holdsOpen].sort();
        expect(governed, `${control.id} at this point`).toEqual([...(gates.get(control.id) ?? [])].sort());
      }
    }
  });

  it('moves a dependant between the two halves when the gate moves, and nowhere else', () => {
    const space = orchardSpace();
    const shut = controlsFor(space, defaultValues(space)).find(
      (control) => control.id === 'orchard.nightHarvest',
    );
    // `false` does not satisfy `['true']`, so night harvest is what is holding the lanterns shut.
    expect(shut?.unlocks).toEqual(['orchard.lanternCount']);
    expect(shut?.holdsOpen).toEqual([]);

    const open = controlsFor(
      space,
      new Map(defaultValues(space)).set('orchard.nightHarvest', true),
    ).find((control) => control.id === 'orchard.nightHarvest');
    expect(open?.unlocks).toEqual([]);
    expect(open?.holdsOpen).toEqual(['orchard.lanternCount']);
  });

  it('answers per gate, not per dependant: one control shut, its co-gate open', () => {
    /*
     * `orchard.lanternCount` is a conjunction of two gates. At the defaults the crew is six, which
     * satisfies `{ min: 4 }` — so `pickersOnShift` is holding its half **open** while
     * `nightHarvest` is holding the row shut. A reverse edge computed from *"is the dependant
     * live"* rather than from *"is my own condition satisfied"* would put both in the same half
     * and would tell a reader that hiring people unlocks lanterns.
     */
    const space = orchardSpace();
    const controls = controlsFor(space, defaultValues(space));
    const pickers = controls.find((control) => control.id === 'orchard.pickersOnShift');
    expect(pickers?.unlocks).toEqual([]);
    expect(pickers?.holdsOpen).toEqual(['orchard.lanternCount']);
    expect(controls.find((c) => c.id === 'orchard.lanternCount')?.enabled).toBe(false);
  });

  it('says nothing about a control that gates nothing', () => {
    const space = orchardSpace();
    for (const id of ['orchard.litresPerTree', 'orchard.lanternCount']) {
      const control = controlsFor(space, defaultValues(space)).find((c) => c.id === id);
      expect(control?.unlocks, id).toEqual([]);
      expect(control?.holdsOpen, id).toEqual([]);
    }
  });

  it('finds the reverse edges of the shipped schema too, and the biggest one is real', () => {
    /*
     * The genericity claim is made above against the orchard; this is the *coverage* claim, which
     * can only be made against the real schema — the same split this file's docstring describes.
     * Derived from `space.parameters` on both sides, so a gate added to `data/` or to a `core`
     * schema moves the expectation with it.
     */
    const space = collectSearchSpace();
    const controls = controlsFor(space, defaultValues(space));
    const expected = new Map<string, number>();
    for (const parameter of space.parameters) {
      for (const gate of Object.keys(parameter.activeWhen ?? {})) {
        expected.set(gate, (expected.get(gate) ?? 0) + 1);
      }
    }
    for (const control of controls) {
      expect(control.unlocks.length + control.holdsOpen.length, control.id).toBe(
        expected.get(control.id) ?? 0,
      );
    }
    // …and the feature is exercised on real data rather than only on fruit: the shipped space has
    // gating controls, and at least one governs several rows at once.
    const governing = controls.filter((c) => c.unlocks.length + c.holdsOpen.length > 0);
    expect(governing.length).toBeGreaterThan(0);
    expect(
      Math.max(...governing.map((c) => c.unlocks.length + c.holdsOpen.length)),
    ).toBeGreaterThan(1);
  });
});

describe('the activeWhen rule is enforced at the control', () => {
  it('refuses an edit to a gated-off dimension, and names the gate', () => {
    const space = orchardSpace();
    const edit = applyControlEdit(space, defaultValues(space), 'orchard.lanternCount', 12);

    expect(edit.accepted).toBe(false);
    if (edit.accepted) throw new Error('unreachable');
    expect(edit.reason).toBe(
      'orchard.lanternCount is not live: it needs orchard.nightHarvest to be true — it is false.',
    );
  });

  it('refuses a reset on a gated-off dimension for the same reason', () => {
    // A reset that bypassed the gate would be a second way to write a value.
    const space = orchardSpace();
    const edit = resetControl(space, defaultValues(space), 'orchard.lanternCount');
    expect(edit.accepted).toBe(false);
  });

  it('refuses a value the schema does not admit, on every kind', () => {
    const space = orchardSpace();
    const values = defaultValues(space);
    const reasons = [
      applyControlEdit(space, values, 'orchard.litresPerTree', 1000),
      applyControlEdit(space, values, 'orchard.pickersOnShift', 2.5),
      applyControlEdit(space, values, 'orchard.irrigation', 'sprinkler'),
      applyControlEdit(space, values, 'orchard.nightHarvest', 'yes'),
      applyControlEdit(space, values, 'orchard.notDeclared', 1),
    ].map((edit) => (edit.accepted ? 'ACCEPTED' : edit.reason));

    expect(reasons).toEqual([
      'orchard.litresPerTree is declared over [0.5, 400]; got 1000.',
      'orchard.pickersOnShift takes a whole number; got 2.5.',
      'orchard.irrigation takes one of drip, flood, none; got "sprinkler".',
      'orchard.nightHarvest takes true or false; got "yes".',
      'orchard.notDeclared is not a dimension of this space.',
    ]);
  });

  it('accepts the declared bounds themselves, because the schema says inclusive', () => {
    const space = orchardSpace();
    const values = defaultValues(space);
    expect(applyControlEdit(space, values, 'orchard.litresPerTree', 0.5).accepted).toBe(true);
    expect(applyControlEdit(space, values, 'orchard.litresPerTree', 400).accepted).toBe(true);
  });

  it('states both declared condition forms without a third branch', () => {
    expect(describeCondition(['drip', 'flood'])).toBe('one of drip, flood');
    expect(describeCondition(['true'])).toBe('true');
    expect(describeCondition({ min: 4 })).toBe('at least 4');
    expect(describeCondition({ max: 9 })).toBe('at most 9');
    expect(describeCondition({ min: 2, max: 9 })).toBe('between 2 and 9');
    expect(describeCondition({})).toBe('any number');
  });
});

describe('coverage of the shipped schema — the one claim that needs the real one', () => {
  it('draws a control for every id `collectSearchSpace()` declares', () => {
    // Derived from the function, never from a fixture: docs/10 § 11 W4 says so in as many words,
    // and a hard-coded 49 would go stale the day a fiftieth dimension is declared.
    const space = collectSearchSpace();
    const controls = controlsFor(space, defaultValues(space));
    expect(controls.map((control) => control.id)).toEqual([...space.ids]);
  });

  it('reaches every declared kind, and nothing else', () => {
    const space = collectSearchSpace();
    const kinds = new Set(controlsFor(space, defaultValues(space)).map((c) => c.kind));
    expect([...kinds].sort()).toEqual(['checkbox', 'select', 'slider', 'stepper']);
  });

  it('gives every control prose to draw, because a control with no help is not self-describing', () => {
    // CLAUDE.md invariant 8's point: the schema is complete enough to render without asking.
    const space = collectSearchSpace();
    const silent = controlsFor(space, defaultValues(space)).filter(
      (control) => control.help.trim() === '',
    );
    expect(silent.map((control) => control.id)).toEqual([]);
  });

  it('points at every discovered schema, and names the rows inside them that cannot be searched', () => {
    /*
     * **The successor to § D134's finding, and the shape of the finding changed.** That entry
     * measured *two of the ten schemas refusing to collect at all* and had the form draw the
     * refusal; it also said, in as many words, that the sets were derived from discovery *"so a
     * fix in `core` turns this red rather than leaving a stale sentence."* T75 is that fix, this
     * test went red, and the sentence is rewritten rather than patched.
     *
     * What the two refusals turned out to be is not the same thing twice:
     *
     * - `SIM_PARAMETERS` was a **defect** — `sim.drainGraceS` and `sim.queueSampleCount` declared
     *   a `log` scale over a range starting at zero. Zero is a *named mode* in both (a deadline at
     *   the demand horizon; the fallback to the reconstructed queue series), so the bound was
     *   right and the scale was wrong. Fixed in `core`, and `sim/simulation.test.ts` now reds on a
     *   regression from `core`'s own side.
     * - `TRAFFIC_PARAMETERS` was **honest**. Its `default: null` rows say *"there is no
     *   default; unset is meaningful"*, which `traffic/parameters.test.ts` defends with a
     *   measurement — 12 %/5 min imposed on Garden Apartments is 2.4x its demand. Honest and
     *   unsearchable at once, which is a distinction `collectSearchSpace` could not previously
     *   draw, and `nullDefault: 'exclude'` is where it draws it now.
     *
     * Two properties keep this from becoming the next stale sentence, and neither is a name in a
     * list. The **schema** set is derived from discovery and the **row** set is derived from the
     * spaces, so a fifth null default, or a sixth, or one appearing in a schema nobody has thought
     * about, reds this. And the collection goes through `collectFormSource` — the function the
     * mount calls — so a test that passes is a statement about the shipped form.
     *
     * **That prediction was borne out, and the count it was written beside was not.** Wave 13
     * § 2.1–2.2 declared eight more null-default rows and this block went red exactly as the
     * sentence above says it would — four became twelve. The mechanism sentence needed no change;
     * the number did, and it is now gone rather than restated, because a count in prose beside a
     * list derived from code is a second source of truth that can only ever drift. The list below
     * is the assertion; there is deliberately no longer a figure in the prose to disagree with it.
     */
    const refused = new Map<string, string>();
    const spaces = new Map<string, SearchSpace>();
    for (const name of discoverParameterSchemas().keys()) {
      const source = collectFormSource(name);
      if (source.ok) spaces.set(name, source.space);
      else refused.set(name, source.reason);
    }

    // Every schema is accounted for: none is silently absent from both lists.
    expect(spaces.size + refused.size).toBe(discoverParameterSchemas().size);
    // The claim § D134 could not make: the form can be pointed at all ten.
    expect([...refused.keys()]).toEqual([]);

    // Derived from the collected spaces, not enumerated: the rows that declare no origin.
    const unsearchable = new Map<string, string>();
    for (const space of spaces.values()) {
      for (const [id, reason] of space.unsearchable) unsearchable.set(id, reason);
    }
    expect([...unsearchable.keys()].sort()).toEqual([
      'traffic.arrivalRatePctPop5min',
      'traffic.batchSize.distribution',
      'traffic.batchSize.mean',
      'traffic.batchSize.weight',
      // § D265. Declared and not searchable for the same reason as its neighbours — but worth its
      // own line, because what it declares is a share of riders who may not go where they are
      // going, and an optimizer free to move it could improve a wait by refusing more people.
      'traffic.credentialGap.wrongZoneShare',
      // docs/14 § 2.3. Three more rows that are declared and not searchable, for the reason every
      // other entry here is: `default: null`, and a search needs a point it can start from.
      'traffic.dayVariation.maxDemandFactor',
      'traffic.dayVariation.minDemandFactor',
      'traffic.dayVariation.peakShiftS',
      'traffic.directionalSplit.incoming',
      'traffic.directionalSplit.interfloor',
      'traffic.directionalSplit.outgoing',
      'traffic.passengerMass.distribution',
      'traffic.passengerMass.maxKg',
      'traffic.passengerMass.meanKg',
      'traffic.passengerMass.minKg',
      'traffic.passengerMass.stdDevKg',
    ]);
    for (const [id, reason] of unsearchable) {
      expect(reason, id).toContain(id);
      expect(reason, id).toContain('default is null');
      expect(reason, id).toContain('A search needs a point it can start from');
    }

    // Every collected row renders a control, and every unsearchable row is drawn as itself.
    for (const [name, space] of spaces) {
      expect(controlsFor(space, defaultValues(space)), name).toHaveLength(space.ids.length);
      const drawn = renderUnsearchable(space.unsearchable);
      if (space.unsearchable.size === 0) {
        expect(drawn, name).toBeUndefined();
        continue;
      }
      expect(drawn, `${name} has unsearchable rows and must draw them`).toBeDefined();
      const text = JSON.stringify(drawn ?? null);
      for (const [id, reason] of space.unsearchable) {
        expect(text, `${name} must draw ${id}`).toContain(id);
        // Compared JSON-escaped, because the collector's sentence quotes the id it is about.
        expect(text, `${name} must draw its reason`).toContain(JSON.stringify(reason).slice(1, -1));
      }
    }
  });

  it('says the same count in the status line as it draws in the list', () => {
    /*
     * The second reader. `space.unsearchable` is read twice — by `renderUnsearchable`, which draws
     * one entry per row, and by `formStatusLine`, which counts them — and § D154 records a mutation
     * that came back green for exactly this shape: *"that value has two independent readers … and
     * freezing one leaves the other live."* Asserted together, and against both a schema that has
     * such rows and one that does not, so neither branch is untested.
     */
    const traffic = collectFormSource('TRAFFIC_PARAMETERS');
    expect(traffic.ok).toBe(true);
    if (!traffic.ok) return;
    const space = traffic.space;
    const values = defaultValues(space);
    const line = formStatusLine(space, controlsFor(space, values), values);
    expect(line).toContain(`${String(space.ids.length)} dimensions`);
    expect(line).toContain(`${String(space.unsearchable.size)} declared but not searchable`);
    expect(JSON.stringify(renderUnsearchable(space.unsearchable)).match(/data-unsearchable/g)).toHaveLength(
      space.unsearchable.size,
    );

    // …and a schema with none says nothing about them rather than saying "0".
    const dispatch = collectFormSource('DISPATCH_PARAMETERS');
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;
    const clean = dispatch.space;
    const cleanValues = defaultValues(clean);
    expect(formStatusLine(clean, controlsFor(clean, cleanValues), cleanValues)).not.toContain(
      'not searchable',
    );
  });

  it('keeps the dispatcher space refusing a dimension with no origin, rather than shrinking by one', () => {
    /*
     * The other half of `nullDefault`, and the reason it is an option rather than the new
     * behaviour everywhere. `'exclude'` is for a caller collecting a schema it does not own; the
     * **shipped dispatcher space** must still throw, because `defaultCandidate` is the point every
     * tuned result is compared against and a space that quietly lost a dimension would be a search
     * over a system nobody configured.
     *
     * Asserted both ways so neither half can pass vacuously: the real space carries no
     * unsearchable row at all, and a manufactured null default reaches the throw.
     */
    expect(collectSearchSpace().unsearchable.size).toBe(0);
    const nulled = { ...DISPATCH_PARAMETERS[0], default: null };
    expect(() => collectSearchSpace({ source: { X_PARAMETERS: [nulled] }, include: () => true })).toThrow(
      /A search needs a point it can start from/,
    );
    // …and the same row under the form's setting is excluded rather than fatal.
    const excluded = collectSearchSpace({
      source: { X_PARAMETERS: [nulled] },
      include: () => true,
      nullDefault: 'exclude',
    });
    expect([...excluded.unsearchable.keys()]).toEqual([nulled.id]);
    expect(excluded.ids).toEqual([]);
  });

  it('disables at least one shipped dimension, so the gate rule is exercised on real data', () => {
    // Not a genericity claim — a sanity check that the shipped schema really does gate something
    // at its own defaults, so the disabled path is not dead in the product.
    const space = collectSearchSpace();
    const disabled = controlsFor(space, defaultValues(space)).filter((c) => !c.enabled);
    expect(disabled.length).toBeGreaterThan(0);
    for (const control of disabled) {
      expect(control.inactiveReason).toBeDefined();
      expect(control.inactiveReason).not.toBe('');
    }
  });
});
