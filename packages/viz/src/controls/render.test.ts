/**
 * The four renderers, checked against the fictional schema.
 *
 * Every structural claim here is made about `orchardSpace()`, for the reason
 * `fictionalSchema.test-helper.ts` states at length: a renderer asserted only against the shipped
 * 49 dimensions passes whether it is generic or whether it was written around the ids it saw.
 *
 * The one thing this file asserts about the *shipped* schema is the liveness claim `docs/10` § 11
 * W4 asks for in as many words — *"add a fictional schema row via the injectable `source` and
 * watch the control appear with no UI change"* — which needs both schemas to be meaningful: the
 * row is new, the renderer is not, and no branch was added between the two runs.
 */

import { describe, expect, it } from 'vitest';

import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import type { SearchSpace } from '@elevator-sim/experiments/browser';

import { controlsFor, defaultValues } from './controls.js';
import {
  SLIDER_STEPS,
  helpIdOf,
  inputIdOf,
  renderControl,
  renderControls,
  sliderPositionOf,
  valueAtSliderPosition,
} from './render.js';
import type { ControlNode } from './render.js';
import { ORCHARD_NAMESPACE, ORCHARD_PARAMETERS, orchardSpace } from './fictionalSchema.test-helper.js';
import type { Control, SliderControl } from './types.js';

/** Every node in a tree, depth first. */
function flatten(node: ControlNode): readonly ControlNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function controlNamed(space: SearchSpace, id: string): Control {
  const control = controlsFor(space, defaultValues(space)).find((candidate) => candidate.id === id);
  if (control === undefined) throw new Error(`no control for ${id}`);
  return control;
}

/** The input elements of one rendered control, by their `data-role`. */
function rolesOf(node: ControlNode): readonly string[] {
  return flatten(node)
    .map((element) => element.attrs['data-role'])
    .filter((role): role is string => role !== undefined);
}

describe('renderer 1 of 4 — continuous draws a slider beside a number', () => {
  const space = orchardSpace();
  const litres = controlNamed(space, 'orchard.litresPerTree');

  it('emits a range and a number, both bounded by the declaration', () => {
    const node = renderControl(litres);
    expect(rolesOf(node)).toEqual(['slider', 'number']);

    const number = flatten(node).find((element) => element.attrs['data-role'] === 'number');
    expect(number?.attrs['min']).toBe('0.5');
    expect(number?.attrs['max']).toBe('400');
    expect(number?.attrs['value']).toBe('12');
  });

  it('travels in log space when the declaration says log', () => {
    if (litres.kind !== 'slider') throw new Error('expected a slider');
    const node = renderControl(litres);
    const range = flatten(node).find((element) => element.attrs['data-role'] === 'slider');
    expect(range?.attrs['data-scale']).toBe('log');

    // The midpoint of a log slider is the geometric mean, not the arithmetic one. sqrt(0.5*400)
    // is ~14.1; the arithmetic midpoint is 200.25, which is where a linear slider would put it.
    const middle = valueAtSliderPosition(litres, SLIDER_STEPS / 2);
    expect(middle).toBeCloseTo(Math.sqrt(0.5 * 400), 6);
    expect(middle).toBeLessThan(20);
  });

  it('is an exact inverse at the endpoints and within one step in between', () => {
    if (litres.kind !== 'slider') throw new Error('expected a slider');
    expect(valueAtSliderPosition(litres, 0)).toBe(litres.min);
    expect(valueAtSliderPosition(litres, SLIDER_STEPS)).toBe(litres.max);

    // In between, the round trip is exact only to the slider's own resolution, and on a log
    // dimension that resolution is **relative**: 1 000 steps over a range spanning a factor of
    // 800 is 0.67 % a step, so 100 L comes back as 100.26 L. Asserting an absolute tolerance here
    // would have been asserting that the number happened to be small. Measured, not assumed: the
    // first version of this test used `toBeCloseTo(value, 1)` and went red at 100 L, which is the
    // fact this comment now records rather than the tolerance it would have hidden.
    const stepRatio = Math.exp(Math.log(litres.max / litres.min) / SLIDER_STEPS);
    for (const value of [0.5, 1, 12, 100, 400]) {
      const round = valueAtSliderPosition(litres, sliderPositionOf(litres, value));
      expect(Math.abs(Math.log(round / value))).toBeLessThanOrEqual(Math.log(stepRatio) * 1.001);
    }
  });

  it('handles a degenerate range without dividing by zero', () => {
    const fixed: SliderControl = { ...(litres as SliderControl), min: 3, max: 3, value: 3 };
    expect(sliderPositionOf(fixed, 3)).toBe(0);
    expect(valueAtSliderPosition(fixed, SLIDER_STEPS / 2)).toBe(3);
  });
});

describe('renderers 2–4 of 4 — integer, categorical, boolean', () => {
  const space = orchardSpace();

  it('draws an integer as a stepper of step 1, bounded by the declaration', () => {
    const node = renderControl(controlNamed(space, 'orchard.pickersOnShift'));
    const input = flatten(node).find((element) => element.attrs['data-role'] === 'stepper');
    expect(input?.attrs['type']).toBe('number');
    expect(input?.attrs['step']).toBe('1');
    expect([input?.attrs['min'], input?.attrs['max'], input?.attrs['value']]).toEqual([
      '1',
      '40',
      '6',
    ]);
  });

  it('draws a categorical as a select over exactly the declared values', () => {
    const node = renderControl(controlNamed(space, 'orchard.irrigation'));
    const options = flatten(node).filter((element) => element.tag === 'option');
    expect(options.map((option) => option.attrs['value'])).toEqual(['drip', 'flood', 'none']);
    // Selected is the current value, and only it.
    expect(options.filter((option) => option.attrs['selected'] !== undefined)).toHaveLength(1);
    expect(
      options.find((option) => option.attrs['selected'] !== undefined)?.attrs['value'],
    ).toBe('drip');
  });

  it('draws a boolean as a checkbox, unchecked at a false default', () => {
    const node = renderControl(controlNamed(space, 'orchard.nightHarvest'));
    const input = flatten(node).find((element) => element.attrs['data-role'] === 'checkbox');
    expect(input?.attrs['type']).toBe('checkbox');
    expect(input?.attrs['checked']).toBeUndefined();
  });
});

describe('the shared frame — help, unit, reset, and the reason', () => {
  const space = orchardSpace();

  it('attaches the declaration prose to the input through aria-describedby', () => {
    // Not a `title`: a tooltip is unreachable by keyboard and these descriptions run to over a
    // thousand characters in the shipped schema.
    const control = controlNamed(space, 'orchard.litresPerTree');
    const node = renderControl(control);
    const help = flatten(node).find((element) => element.attrs['id'] === helpIdOf(control.id));
    expect(help?.text).toBe(control.help);
    for (const input of flatten(node).filter((e) => e.attrs['data-role'] !== undefined)) {
      expect(input.attrs['aria-describedby']).toBe(helpIdOf(control.id));
    }
  });

  it('draws the unit as its own element, only when the declaration has one', () => {
    const withUnit = flatten(renderControl(controlNamed(space, 'orchard.litresPerTree')));
    const without = flatten(renderControl(controlNamed(space, 'orchard.pickersOnShift')));
    expect(withUnit.find((e) => e.attrs['class'] === 'control-unit')?.text).toBe('L');
    expect(without.find((e) => e.attrs['class'] === 'control-unit')).toBeUndefined();
  });

  it('offers a reset naming the declared default', () => {
    const node = renderControl(controlNamed(space, 'orchard.pickersOnShift'));
    const reset = flatten(node).find((e) => e.attrs['data-reset'] !== undefined);
    expect(reset?.attrs['data-reset']).toBe('orchard.pickersOnShift');
    expect(reset?.attrs['title']).toBe('reset to 6');
  });

  it('disables an inactive control and prints its reason as text, not as a state', () => {
    // UX.md KB-15: never colour — and here never a visual state — as the only signal.
    const node = renderControl(controlNamed(space, 'orchard.lanternCount'));
    const nodes = flatten(node);
    expect(node.attrs['class']).toBe('control control-disabled');
    for (const input of nodes.filter((e) => e.attrs['data-role'] !== undefined)) {
      expect(input.attrs['disabled']).toBe('');
      expect(input.attrs['aria-disabled']).toBe('true');
    }
    expect(nodes.find((e) => e.attrs['class'] === 'control-inactive')?.text).toBe(
      'not in effect: it needs orchard.nightHarvest to be true — it is false',
    );
  });

  it('prints no reason element on an active control, rather than an empty one', () => {
    const nodes = flatten(renderControl(controlNamed(space, 'orchard.irrigation')));
    expect(nodes.find((e) => e.attrs['class'] === 'control-inactive')).toBeUndefined();
  });

  it('badges the inactive control on its label line, with the gate id in words', () => {
    // § D222. The complaint this closes is that the only inline signal was a visual state, and
    // the sentence explaining it sat below a description running to 727 characters. KB-15: the
    // badge is words, so it survives the tint being invisible.
    const node = renderControl(controlNamed(space, 'orchard.lanternCount'));
    const badge = flatten(node).find((e) => e.attrs['class'] === 'control-lock');
    expect(badge?.text).toBe('needs orchard.nightHarvest');
    expect(badge?.attrs['data-unmet-gates']).toBe('orchard.nightHarvest');
  });

  it('badges no active control — the signal means inactive, or it means nothing', () => {
    for (const control of controlsFor(space, defaultValues(space))) {
      const badge = flatten(renderControl(control)).find(
        (e) => e.attrs['class'] === 'control-lock',
      );
      // Asserted over every control in the space and in both directions, so a badge that
      // appeared on everything would fail here rather than read as a success on the one row
      // the previous test looks at.
      expect(badge === undefined).toBe(control.enabled);
    }
  });

  it('badges a gating control with what it governs, in words and a number', () => {
    /*
     * Issue #79 / § D252 — the mirror of the badge above. `orchard.nightHarvest` is `false`, which
     * does not satisfy the lanterns' `['true']`, so it is holding one control shut and the badge
     * says so in the actionable direction. The ids go on a data attribute rather than into the
     * words: the tab already orders a gated control *below* its gate, so *which* is answered by
     * the layout and *how many to look for* is what the badge adds.
     */
    const badgeOf = (id: string, values?: ReturnType<typeof defaultValues>): ControlNode | undefined => {
      const control = controlsFor(space, values ?? defaultValues(space)).find((c) => c.id === id);
      if (control === undefined) throw new Error(`no control for ${id}`);
      return flatten(renderControl(control)).find((e) => e.attrs['class'] === 'control-gate');
    };

    const shut = badgeOf('orchard.nightHarvest');
    expect(shut?.text).toBe('unlocks 1');
    expect(shut?.attrs['data-unlocks']).toBe('orchard.lanternCount');
    expect(shut?.attrs['data-holds-open']).toBeUndefined();

    // Thrown on, the badge does not vanish — it changes tense. That is the whole reason the model
    // carries both halves: it would otherwise disappear at the moment somebody is watching to see
    // what they just did.
    const open = badgeOf(
      'orchard.nightHarvest',
      new Map(defaultValues(space)).set('orchard.nightHarvest', true),
    );
    expect(open?.text).toBe('holds 1 open');
    expect(open?.attrs['data-holds-open']).toBe('orchard.lanternCount');
    expect(open?.attrs['data-unlocks']).toBeUndefined();
  });

  it('badges exactly the controls that gate something, and no control that gates nothing', () => {
    /*
     * Both directions over the whole space and at two points, for the reason the lock badge's own
     * pair of cases gives: a badge that appeared on everything would read as a success on the one
     * row the case above looks at. Presence is keyed on the structure — a control that gates
     * something is badged whether its dependants are currently shut or open.
     */
    for (const values of [
      defaultValues(space),
      new Map(defaultValues(space)).set('orchard.nightHarvest', true),
    ]) {
      for (const control of controlsFor(space, values)) {
        const badge = flatten(renderControl(control)).find(
          (e) => e.attrs['class'] === 'control-gate',
        );
        const governs = control.unlocks.length + control.holdsOpen.length > 0;
        expect(badge !== undefined, `${control.id} governs ${String(governs)}`).toBe(governs);
      }
    }
  });

  it('carries both badges when a control is gated and gates, without either replacing the other', () => {
    /*
     * The case that makes the two badges independent rather than a three-state one. There is no
     * such row in the orchard — its gates are all top-level — so it is built here from the
     * declared type, which is also the point: a `Control` is a plain interface, and the renderer
     * may not assume the two conditions are exclusive. `auction.rounds` in the shipped schema is
     * exactly this shape: gated by `auction.aggregation` and gating `auction.reserveMarginalDelayS`.
     */
    const both: Control = {
      ...controlNamed(space, 'orchard.lanternCount'),
      unlocks: ['orchard.litresPerTree'],
    };
    const emitted = flatten(renderControl(both));
    expect(emitted.find((e) => e.attrs['class'] === 'control-lock')?.text).toBe(
      'needs orchard.nightHarvest',
    );
    expect(emitted.find((e) => e.attrs['class'] === 'control-gate')?.text).toBe('unlocks 1');
  });

  it('names the actionable half when a gate is holding some shut and others open', () => {
    // A categorical gate can have dependants under different conditions. The badge names the ones
    // a reader can do something about; the two data attributes carry the whole partition, so
    // nothing is dropped — it is summarised.
    const mixed: Control = {
      ...controlNamed(space, 'orchard.irrigation'),
      unlocks: ['orchard.a', 'orchard.b'],
      holdsOpen: ['orchard.c'],
    };
    const badge = flatten(renderControl(mixed)).find((e) => e.attrs['class'] === 'control-gate');
    expect(badge?.text).toBe('unlocks 2');
    expect(badge?.attrs['data-unlocks']).toBe('orchard.a orchard.b');
    expect(badge?.attrs['data-holds-open']).toBe('orchard.c');
  });

  it('puts the reason above the description, not below it', () => {
    /*
     * The ordering is the fix, not a detail: `control-help` is a median of 318 characters on the
     * shipped schema's twenty inactive rows, so a reason emitted last was a paragraph away from
     * the control it explains. Asserted on indices rather than on a snapshot of the frame, so
     * adding a sixth child does not fail it.
     */
    const children = renderControl(controlNamed(space, 'orchard.lanternCount')).children;
    const reason = children.findIndex((child) => child.attrs['class'] === 'control-inactive');
    const help = children.findIndex((child) => child.attrs['class'] === 'control-help');
    expect(reason).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(-1);
    expect(reason).toBeLessThan(help);
  });

  it('describes an inactive input by its reason first, then its help', () => {
    /*
     * The accessibility half of the same defect: `aria-describedby` named the help alone, so a
     * screen reader said `disabled` and had no route to the sentence saying which gate to move.
     *
     * The reason's id is read **off the emitted element** rather than recomputed from a naming
     * convention the renderer also uses. That is deliberate: this way the assertion fails if the
     * attribute points at an id nothing carries, which is the shape the bug would take if the two
     * ever drifted, and a test that rebuilt the id from the same helper could not see it.
     */
    const control = controlNamed(space, 'orchard.lanternCount');
    const node = renderControl(control);
    const nodes = flatten(node);
    const reasonId = nodes.find((e) => e.attrs['class'] === 'control-inactive')?.attrs['id'];
    expect(reasonId).toBeDefined();

    const inputs = nodes.filter((e) => e.attrs['data-role'] !== undefined);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      // Reason first: the description runs to 727 characters on the shipped schema's inactive
      // rows, and the reason is the clause a reader who cannot move the control needs first.
      expect(input.attrs['aria-describedby']).toBe(`${reasonId ?? ''} ${helpIdOf(control.id)}`);
      for (const id of (input.attrs['aria-describedby'] ?? '').split(' ')) {
        expect(nodes.some((e) => e.attrs['id'] === id)).toBe(true);
      }
    }
  });

  it('omits the reason from aria-describedby when there is no reason', () => {
    const control = controlNamed(space, 'orchard.irrigation');
    const node = renderControl(control);
    const inputs = flatten(node).filter((e) => e.attrs['data-role'] !== undefined);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      // Exactly the help, and nothing appended: an active control has no reason to point at, and
      // a trailing separator would be a dangling reference of its own.
      expect(input.attrs['aria-describedby']).toBe(helpIdOf(control.id));
    }
  });

  it('gives every input a unique DOM id derived from the parameter id', () => {
    const controls = controlsFor(space, defaultValues(space));
    const ids = controls
      .flatMap((control) => flatten(renderControl(control)))
      .map((element) => element.attrs['id'])
      .filter((id): id is string => id !== undefined);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(inputIdOf('orchard.litresPerTree'));
  });

  it('gives every input an accessible name, and the name resolves', () => {
    /*
     * A defect of the same kind as § D222's and strictly larger than it. The control's name was a
     * `<span class="control-label">` — text on screen and nothing at all in an accessibility tree —
     * so every input on the Parameters tab announced its type, its state and its description while
     * never saying *which parameter*. D222 left the name of the *gate* unspoken; this left the name
     * of the *control* unspoken.
     *
     * Over every control the fictional schema produces, not one hand-picked row, and each reference
     * is resolved against the emitted tree rather than recomputed from the naming helper: a `for`
     * pointing at an id nothing carries names exactly as much as the span did, and an assertion
     * that rebuilt the id from `inputIdOf` could not tell the two apart.
     */
    const controls = controlsFor(space, defaultValues(space));
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const nodes = flatten(renderControl(control));
      const label = nodes.find((element) => element.attrs['class'] === 'control-label');
      expect(label?.tag, control.id).toBe('label');
      expect(label?.text, control.id).toBe(control.label);

      const target = label?.attrs['for'];
      expect(target, control.id).toBeDefined();
      expect(
        nodes.some((element) => element.attrs['id'] === target),
        `${control.id}: label points at an id nothing carries`,
      ).toBe(true);

      const inputs = nodes.filter((element) => element.attrs['data-role'] !== undefined);
      expect(inputs.length, control.id).toBeGreaterThan(0);
      for (const input of inputs) {
        const named =
          input.attrs['id'] === target ||
          (input.attrs['aria-labelledby'] !== undefined &&
            nodes.some((element) => element.attrs['id'] === input.attrs['aria-labelledby']));
        expect(named, `${control.id} / ${input.attrs['data-role'] ?? ''} has no name`).toBe(true);
      }
    }
  });

  it("labels the slider's number box by reference, not by a second copy of the words", () => {
    // Two inputs, one parameter, and `for` names exactly one. The number box points at the same
    // element rather than carrying its own `aria-label`, because a copy of `control.label` is the
    // thing that could later disagree with the label beside it.
    const nodes = flatten(renderControl(controlNamed(space, 'orchard.litresPerTree')));
    const label = nodes.find((element) => element.attrs['class'] === 'control-label');
    const range = nodes.find((element) => element.attrs['data-role'] === 'slider');
    const number = nodes.find((element) => element.attrs['data-role'] === 'number');

    expect(range?.attrs['id']).toBe(label?.attrs['for']);
    expect(number?.attrs['aria-labelledby']).toBe(label?.attrs['id']);
    expect(number?.attrs['id']).not.toBe(range?.attrs['id']);
    expect(label?.attrs['id']).toBeDefined();
  });
});

describe('the whole form groups by section without enumerating one', () => {
  it('makes a fieldset per section, named by the schema', () => {
    const space = orchardSpace();
    const form = renderControls(controlsFor(space, defaultValues(space)));
    const sections = flatten(form).filter((element) => element.tag === 'fieldset');
    // One section, because the fictional schema declares one — and this package has never heard
    // of it.
    expect(sections.map((section) => section.attrs['data-section'])).toEqual(['orchard']);
  });

  it('makes a fieldset per section of the shipped schema too, with no code between them', () => {
    const space = collectSearchSpace();
    const form = renderControls(controlsFor(space, defaultValues(space)));
    const sections = flatten(form)
      .filter((element) => element.tag === 'fieldset')
      .map((element) => element.attrs['data-section']);
    // Derived from the ids, not listed: the assertion is that the set matches what the space
    // declares, whatever that turns out to be.
    expect(new Set(sections)).toEqual(new Set(space.parameters.map((p) => p.section)));
  });
});

describe('liveness — a schema row this product does not ship appears with no UI change', () => {
  it('adds a row through the injectable source and the control comes out right', () => {
    // docs/10 § 11 W4's stated liveness evidence, run in both directions.
    const before = orchardSpace();
    const beforeIds = controlsFor(before, defaultValues(before)).map((control) => control.id);
    expect(beforeIds).not.toContain('orchard.beehiveCount');

    const widened = collectSearchSpace({
      source: {
        ...ORCHARD_NAMESPACE,
        ORCHARD_PARAMETERS: [
          ...ORCHARD_PARAMETERS,
          {
            id: 'orchard.beehiveCount',
            type: 'integer',
            range: [0, 24],
            default: 2,
            unit: 'hives',
            description: 'Hives placed in the block for pollination. A row this file invents.',
            activeWhen: { 'orchard.irrigation': ['drip'] },
          },
        ],
      },
      include: () => true,
    });

    const control = controlsFor(widened, defaultValues(widened)).find(
      (candidate) => candidate.id === 'orchard.beehiveCount',
    );
    expect(control).toBeDefined();
    expect(control?.kind).toBe('stepper');
    expect(control?.unit).toBe('hives');
    expect(control?.enabled).toBe(true);

    const node = renderControl(control as Control);
    const input = flatten(node).find((element) => element.attrs['data-role'] === 'stepper');
    expect([input?.attrs['min'], input?.attrs['max'], input?.attrs['value']]).toEqual([
      '0',
      '24',
      '2',
    ]);
    // …and the row is gated, so turning its gate off disables it — again with no UI change.
    const dry = new Map(defaultValues(widened)).set('orchard.irrigation', 'none');
    const gated = controlsFor(widened, dry).find((c) => c.id === 'orchard.beehiveCount');
    expect(gated?.enabled).toBe(false);
    expect(gated?.inactiveReason).toBe('needs orchard.irrigation to be drip — it is none');
  });
});
