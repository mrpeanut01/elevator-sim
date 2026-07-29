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

  it('gives every input a unique DOM id derived from the parameter id', () => {
    const controls = controlsFor(space, defaultValues(space));
    const ids = controls
      .flatMap((control) => flatten(renderControl(control)))
      .map((element) => element.attrs['id'])
      .filter((id): id is string => id !== undefined);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(inputIdOf('orchard.litresPerTree'));
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
