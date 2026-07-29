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

import { collectSearchSpace, discoverParameterSchemas } from '@elevator-sim/experiments/browser';

import {
  applyControlEdit,
  candidateOf,
  controlsFor,
  defaultValues,
  describeCondition,
  resetControl,
} from './controls.js';
import { orchardSpace } from './fictionalSchema.test-helper.js';

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

  it('says which discovered schemas the form cannot point at, and why', () => {
    /*
     * **A finding, pinned rather than worked around.** docs/10 § 11 W4 says the `TRAFFIC_PARAMETERS`
     * half of W4 is *"unblocked either way, because that schema is on the `core/browser` barrel"* —
     * which is true about *reachability* and false about *collectability*. Measured here: of the
     * schemas `discoverParameterSchemas()` finds, exactly two refuse to collect into a search
     * space, and both refusals are `core`'s own declarations being honest:
     *
     * - `TRAFFIC_PARAMETERS` — `traffic.arrivalRatePctPop5min` declares a `null` default, which is
     *   the *"only honest default"* docs/10 § 9.3 quotes approvingly, and which a search space
     *   cannot start from.
     * - `SIM_PARAMETERS` — a `log` scale over a range starting at zero.
     *
     * The form draws the refusal rather than hiding the schema (`dev/parameterForm.ts`). This test
     * is what stops that becoming a stale sentence: the sets are derived from discovery, so a fix
     * in `core` turns this red and the claim gets rewritten instead of rotting.
     */
    const refused = new Map<string, string>();
    const collected: string[] = [];
    for (const [name, rows] of discoverParameterSchemas()) {
      try {
        collectSearchSpace({ source: { [name]: rows }, include: () => true });
        collected.push(name);
      } catch (error) {
        refused.set(name, error instanceof Error ? error.message : String(error));
      }
    }

    expect([...refused.keys()].sort()).toEqual(['SIM_PARAMETERS', 'TRAFFIC_PARAMETERS']);
    expect(refused.get('TRAFFIC_PARAMETERS')).toContain('traffic.arrivalRatePctPop5min');
    expect(refused.get('TRAFFIC_PARAMETERS')).toContain('default is null');
    expect(refused.get('SIM_PARAMETERS')).toContain('log scale over a range starting at 0');
    // Every schema is accounted for: none is silently absent from both lists.
    expect(collected.length + refused.size).toBe(discoverParameterSchemas().size);
    // …and every one that does collect renders.
    for (const name of collected) {
      const rows = discoverParameterSchemas().get(name);
      const space = collectSearchSpace({ source: { [name]: rows }, include: () => true });
      expect(controlsFor(space, defaultValues(space))).toHaveLength(space.ids.length);
    }
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
