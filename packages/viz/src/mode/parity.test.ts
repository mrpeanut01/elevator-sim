/**
 * § 4's mode-parity criterion, proved **against a failure state the product does not ship**.
 *
 * [`DECISIONS.md` § D163](../../../../DECISIONS.md) clause 2 makes two demands of this file, and
 * only the second is the hard one:
 *
 * 1. Both modes exist, and every failure Advanced draws is drawn in Basic. That is the assertion.
 * 2. The parity is **derived, not listed** — *"A hand-written parity list is the hand-written-list
 *    defect § D152 closed one layer down, and it would fail the same way — silently, when a ninth
 *    failure state is added."* That is what the fictional case is for.
 *
 * The fifth fail state, the un-shipped suppression reason and the un-raised warning code in
 * `fictionalFailState.test-helper.ts` are all things no branch of the product produces. If the
 * check recognised them by matching `FAIL_STATES`, by matching `core`'s prose, or by any list at
 * all, every assertion below would fail. It recognises them because
 * {@link disclosureItems} carries the strings the caller handed it and
 * {@link parityViolations} reads the item's own origin.
 *
 * The negative half is the one worth reading: a Basic mode that drops the ninth state, and a Basic
 * mode that keeps it and drops its reason, both go **red with the state named**.
 */

import { describe, expect, it } from 'vitest';

import {
  BASIC_HIDES,
  SUPPRESSION_LEAD,
  disclosureItems,
  rowClassesOf,
  type FailStateDisclosure,
} from './disclosure.js';
import {
  FICTIONAL_FAIL_STATE,
  FICTIONAL_SUPPRESSION_REASON,
  FICTIONAL_WARNING,
  fictionalFailStateReport,
  fictionalRecording,
} from './fictionalFailState.test-helper.js';
import { parityRefusal, parityViolations } from './parity.js';
import { FIGURE_ORDER } from '../render/runSummary.js';
import { itemsIn, type DisclosureItem } from './types.js';

/**
 * Everything Basic actually puts on screen, as one string.
 *
 * The **label** is in it, because the mount draws the label — `dev/main.ts`'s `drawRunSummary`
 * and `dev/campaignPanel.ts`'s `row` both emit it. Leaving it out would let a Basic mode drop the
 * name of the state and keep its count, with this suite green.
 */
function basicText(items: readonly DisclosureItem[]): string {
  return itemsIn(items, 'basic')
    .map((item) =>
      [item.label, item.rendering.value, item.rendering.count, item.rendering.note]
        .filter((part): part is string => part !== undefined)
        .join(' '),
    )
    .join('\n');
}

const FICTIONAL_REPORT: FailStateDisclosure = fictionalFailStateReport();

function itemsWithFifthState(): readonly DisclosureItem[] {
  return disclosureItems({
    recording: fictionalRecording(),
    dispatcherName: 'Collective control',
    failStates: [FICTIONAL_REPORT],
    lockedOut: [
      {
        floorId: 'L42',
        legCount: 3,
        cause: 'rider-has-no-credential',
        credentialGroups: [],
      },
    ],
  });
}

describe('the parity set is derived, and a fictional failure state proves it', () => {
  it('carries a fail state the product does not ship into Basic, with its diagnosis', () => {
    const items = itemsWithFifthState();
    expect(parityViolations(items)).toEqual([]);

    const text = basicText(items);
    // Three separate strings, because § D163 names three sets and a check that only found the
    // frequency would pass a Basic mode that kept the count and dropped the explanation.
    expect(text).toContain(FICTIONAL_REPORT.frequency);
    expect(text).toContain(FICTIONAL_REPORT.sentence);
    expect(text).toContain(FICTIONAL_REPORT.diagnosis);
    // Nothing in the item list names the state; it is carried because it was handed over.
    expect(text).toContain(FICTIONAL_FAIL_STATE);
  });

  it('carries a suppression reason no `core` branch emits, verbatim, and leads it plainly', () => {
    const items = itemsWithFifthState();
    const text = basicText(items);
    expect(text).toContain(FICTIONAL_SUPPRESSION_REASON);
    expect(text).toContain(SUPPRESSION_LEAD);
    // R3: the value slot says `suppressed`, never a blank, a dash or a zero.
    const suppressed = items.filter((item) => item.origin.kind === 'suppression');
    expect(suppressed.length).toBeGreaterThan(0);
    for (const item of suppressed) {
      expect(item.basic?.value).toBe('suppressed');
    }
  });

  it('carries a warning code `core` never raises', () => {
    expect(basicText(itemsWithFifthState())).toContain(FICTIONAL_WARNING);
  });

  it('keeps the seed in Basic — R7, and § 4 item 5', () => {
    const recording = fictionalRecording();
    const items = disclosureItems({ recording, dispatcherName: 'Collective control' });
    expect(basicText(items)).toContain(recording.seed);
  });

  it('names the undelivered count in Basic — § 4 item 2', () => {
    const items = disclosureItems({ recording: fictionalRecording() });
    expect(basicText(items)).toContain('7 people never got where they were going');
  });

  it('names the passenger model in Basic when it is destination-dispatch — § 4 item 6', () => {
    const items = disclosureItems({ recording: fictionalRecording() });
    expect(basicText(items)).toContain('riders are told which car to walk to');
  });

  it('names the locked-out landing in Basic — § 4 item 4', () => {
    expect(basicText(itemsWithFifthState())).toContain('A call no car may legally answer');
  });
});

describe('the check goes red, and it names the thing that went missing', () => {
  /**
   * A Basic mode that drops an item — the shape a ninth failure state arrives in.
   *
   * Written as a generic transform over the origin rather than as an edit to `disclosure.ts`,
   * because what is being demonstrated is that the **check** reacts. A mode implementation that
   * only knew the four shipped states would drop the fifth exactly like this.
   */
  function hidingFromBasic(
    items: readonly DisclosureItem[],
    predicate: (item: DisclosureItem) => boolean,
  ): readonly DisclosureItem[] {
    return items.map((item) => (predicate(item) ? { ...item, basic: null } : item));
  }

  it('a Basic mode that hides the fifth fail state is refused, by name', () => {
    const hidden = hidingFromBasic(
      itemsWithFifthState(),
      (item) =>
        item.origin.kind === 'fail-state' && item.origin.state === FICTIONAL_FAIL_STATE,
    );
    const violations = parityViolations(hidden);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('hidden-in-basic');
    expect(violations[0]?.itemId).toBe(`fail-state-${FICTIONAL_FAIL_STATE}`);
    expect(parityRefusal(hidden)).toContain(FICTIONAL_FAIL_STATE);
    expect(parityRefusal(hidden)).toContain('may never hide a failure');
  });

  it('a Basic mode that hides the fifth state’s diagnosis is refused separately', () => {
    const hidden = hidingFromBasic(
      itemsWithFifthState(),
      (item) =>
        item.origin.kind === 'fail-state-diagnosis' &&
        item.origin.state === FICTIONAL_FAIL_STATE,
    );
    const violations = parityViolations(hidden);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.itemId).toBe(`fail-state-${FICTIONAL_FAIL_STATE}-diagnosis`);
  });

  it('a Basic mode that keeps the diagnosis row and rewords it is refused, with the text quoted', () => {
    // Distinct from hiding the row. The row survives, the floor id does not, and the check has to
    // notice — a `hidden-in-basic` rule alone would pass this, which is why the diagnosis carries
    // its own `mustCarry`.
    const reworded = itemsWithFifthState().map((item) =>
      item.origin.kind === 'fail-state-diagnosis' && item.basic !== null
        ? { ...item, basic: { ...item.basic, value: 'somewhere in the building' } }
        : item,
    );
    const violations = parityViolations(reworded);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('dropped-text');
    expect(violations[0]?.detail).toBe(FICTIONAL_REPORT.diagnosis);
  });

  it('a Basic mode that keeps the row and drops the reason is refused, with the reason quoted', () => {
    const shortened = itemsWithFifthState().map((item) =>
      item.origin.kind === 'suppression' && item.basic !== null
        ? { ...item, basic: { ...item.basic, note: 'why?' } }
        : item,
    );
    const violations = parityViolations(shortened);
    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) {
      expect(violation.rule).toBe('dropped-text');
    }
    expect(parityRefusal(shortened)).toContain(FICTIONAL_SUPPRESSION_REASON);
  });

  it('a Basic mode that drops the seed is refused', () => {
    const recording = fictionalRecording();
    const stripped = disclosureItems({ recording }).map((item) =>
      item.origin.kind === 'run-identity' && item.basic !== null
        ? { ...item, basic: { ...item.basic, note: 'a run' } }
        : item,
    );
    const violations = parityViolations(stripped);
    expect(violations.map((entry) => entry.rule)).toEqual(['dropped-text']);
    expect(violations[0]?.detail).toBe(recording.seed);
  });

  it('a Basic mode that drops the warning is refused, with the code named', () => {
    const stripped = hidingFromBasic(
      itemsWithFifthState(),
      (item) => item.origin.kind === 'warning',
    );
    expect(parityRefusal(stripped)).toContain(FICTIONAL_WARNING);
  });

  it('a Basic mode that keeps every word and drops the warning styling is refused', () => {
    // The failure hidden in the stylesheet. Advanced draws the run's warnings as warnings; a
    // Basic mode that draws the same text in the normal class has kept § 4's words and lost its
    // signal. **This rule could not fire when severity lived on the item** — one value, read
    // twice, compared with itself — which is the first of § D159's five shapes, found by writing
    // the test that was supposed to watch it fail.
    const flattened = itemsWithFifthState().map((item) =>
      item.origin.kind === 'warning' && item.basic !== null
        ? { ...item, basic: { ...item.basic, severity: 'normal' as const } }
        : item,
    );
    const violations = parityViolations(flattened).filter(
      (entry) => entry.rule === 'de-escalated',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.originKind).toBe('warning');
    expect(parityRefusal(flattened)).toContain('broken in the stylesheet');
  });
});

describe('what Basic hides is complexity, and it is checked against what exists', () => {
  it('every hidden figure id is one the run summary actually produces', () => {
    // A stale entry here would silently hide nothing and look like a policy. § D152's failure,
    // pointed at the negotiable half of § 4.
    for (const id of BASIC_HIDES) {
      expect(FIGURE_ORDER as readonly string[]).toContain(id);
    }
  });

  it('hides them, and hides nothing that carries a failure', () => {
    const items = itemsWithFifthState();
    const basicIds = new Set(itemsIn(items, 'basic').map((item) => item.id));
    /*
     * The count first, and the loop second. Written the other way round — a `for` over
     * `BASIC_HIDES` and nothing else — this test went **green** on a mutation that emptied the
     * set, because a loop over an empty collection asserts nothing. Caught by the liveness sweep,
     * which is the fourth of § D159's five shapes arriving in a test written this lane.
     */
    expect(BASIC_HIDES.size).toBeGreaterThan(0);
    expect(itemsIn(items, 'basic').length).toBe(itemsIn(items, 'advanced').length - BASIC_HIDES.size);
    for (const id of BASIC_HIDES) expect(basicIds.has(id)).toBe(false);
    expect(parityViolations(items)).toEqual([]);
  });
});

describe('a row keeps the class the stylesheet already gives it', () => {
  /*
   * Found by driving, not by a test. Moving the mount from `SummaryFigure` to `DisclosureItem`
   * replaced every row's class with the **origin** kind, and `index.html` styles the *figure*
   * kinds — `figure-observation`, `figure-estimate`, `figure-suppressed`, `figure-absent`. Every
   * row rendered unstyled with the whole suite green, because no test read a class name.
   */
  it('keeps the figure kind on a figure row, and adds the origin beside it', () => {
    const items = itemsWithFifthState();
    const demand = items.find((item) => item.id === 'demand');
    expect(demand).toBeDefined();
    if (demand === undefined || demand.basic === null) return;
    const classes = rowClassesOf(demand, demand.basic);
    expect(classes).toContain('figure-observation');
    expect(classes).toContain('figure-origin-figure');
    expect(classes).toContain('figure-warning');
  });

  it('gives a refused statistic the class a suppressed figure had', () => {
    const items = itemsWithFifthState();
    const suppressed = items.find((item) => item.origin.kind === 'suppression');
    expect(suppressed).toBeDefined();
    if (suppressed === undefined || suppressed.basic === null) return;
    expect(rowClassesOf(suppressed, suppressed.basic)).toContain('figure-suppressed');
  });

  it('takes the warning class from the **rendering**, so a de-escalated Basic row loses it', () => {
    const items = itemsWithFifthState();
    const warning = items.find((item) => item.origin.kind === 'warning');
    expect(warning).toBeDefined();
    if (warning === undefined || warning.basic === null) return;
    expect(rowClassesOf(warning, warning.basic)).toContain('figure-warning');
    // The origin class is prefixed, so the origin kind `warning` cannot masquerade as the
    // severity class and make the assertion below unfalsifiable. It did, once.
    expect(rowClassesOf(warning, warning.basic)).toContain('figure-origin-warning');
    expect(rowClassesOf(warning, { ...warning.basic, severity: 'normal' })).not.toContain(
      'figure-warning',
    );
  });
});

describe('a mode is a presentation, not a run — § 4’s own acceptance clause', () => {
  it('does not touch the recording it was given, in either mode', () => {
    const recording = fictionalRecording();
    const before = JSON.stringify(recording);
    const items = disclosureItems({ recording, failStates: [FICTIONAL_REPORT] });
    void itemsIn(items, 'basic');
    void itemsIn(items, 'advanced');
    expect(JSON.stringify(recording)).toBe(before);
  });

  it('produces the same items whichever mode is read first', () => {
    const recording = fictionalRecording();
    const first = disclosureItems({ recording, failStates: [FICTIONAL_REPORT] });
    const second = disclosureItems({ recording, failStates: [FICTIONAL_REPORT] });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
