/**
 * The mode-parity check — `docs/10-experience-layer-contract.md` § 4, and
 * [`DECISIONS.md` § D163](../../../../DECISIONS.md) clause 2.
 *
 * ## Read this file for what is *not* in it
 *
 * There is no fail state here. No suppression ground, no warning code, no figure id, no
 * `awtIsValid`, no `saturated`. Search it: the only domain words are in the docstrings. That
 * absence is the acceptance criterion, not tidiness — § D163 says a hand-written parity list *"is
 * the hand-written-list defect § D152 closed one layer down, and it would fail the same way —
 * silently, when a ninth failure state is added."*
 *
 * What the rule operates on is {@link DisclosureItem.origin} — *what a thing is* — and
 * {@link DisclosureItem.mustCarry} — *the strings the run itself produced*. Both are built from
 * the source data in `mode/disclosure.ts`, so a ninth fail state, a fifth suppression ground or a
 * new warning code enters this check by existing.
 *
 * ## The three rules, and the fourth that is a type instead
 *
 * 1. **A must-show item is present in Basic.** § 4's non-negotiable list, reached through the
 *    origin classification rather than through a list of members.
 * 2. **Everything it must carry survives.** R3: *"Suppression replaces the number, it never hides
 *    it … Basic mode may shorten the reason; it may not remove it."* A Basic rendering that keeps
 *    the row and drops the reason is the exact shape of the failure § 4 forbids, and rule 1 alone
 *    would pass it.
 * 3. **A failure is not quietly de-escalated.** An item Advanced draws as a warning and Basic
 *    draws as normal has hidden the failure in the styling while keeping the words — which is the
 *    same defect wearing a stylesheet.
 *
 * ## The direction this file does not check, stated rather than discovered later
 *
 * All three rules fire on Basic **dropping** something. Not one fires on Basic showing exactly what
 * Advanced showed, so a Basic rendering that is a byte-for-byte copy of Advanced returns an empty
 * array — `mode/disclosure.test.ts` builds that copy and watches this function pass it, because a
 * limitation nobody has driven is a limitation somebody will forget.
 *
 * That is the right shape for what this file is: § 4's clause is *"Basic mode may hide complexity.
 * It may never hide a failure"*, and refusing a Basic mode for being **too informative** would be
 * refusing the safe direction. But it means this check can never notice that the disclosure split
 * does not exist — which is what had happened, and what issue #71 measured. The other direction is
 * a claim about the *product* rather than about one item list, and it is asserted where a claim
 * about the product belongs: `mode/disclosure.test.ts` drives every shipped building and requires
 * the two modes to differ on every figure Basic keeps. See
 * [`DECISIONS.md` § D240](../../../../DECISIONS.md).
 *
 * § 4's *"Advanced is a strict superset"* is **not** a rule here, and that is deliberate.
 * {@link DisclosureItem.advanced} is non-nullable while `basic` is `Rendering | null`, so an item
 * Advanced cannot draw is unexpressible. A runtime check for it would be a guard that cannot fire
 * — the shape `src/index.ts` § *Deleted rather than kept as decoration* records this package
 * removing twice — so the guarantee is carried by the type and stated here rather than mimed by a
 * test that always passes.
 *
 * ## Why the check reads the rendered items rather than the producer
 *
 * `parityViolations` takes the item list a surface is about to draw. A check that re-ran
 * `disclosureItems` itself would be asserting that a function agrees with itself; the caller is
 * free to filter, reorder or truncate, and the whole risk lives in that freedom. `dev/main.ts`
 * and `dev/campaignPanel.ts` therefore hand it exactly what they mounted.
 */

import {
  disclosureClassOf,
  itemsIn,
  type DisclosureItem,
  type Rendering,
} from './types.js';

/** One way a Basic rendering failed § 4. Never a boolean — a count says nothing about what broke. */
export interface ParityViolation {
  /** The item's id, so the failure names the thing rather than the rule. */
  readonly itemId: string;
  /** The origin kind, so a reader can see which of § 4's clauses is at stake. */
  readonly originKind: string;
  readonly rule: 'hidden-in-basic' | 'dropped-text' | 'de-escalated';
  /** What is missing, in the words the run produced. */
  readonly detail: string;
  /** The whole sentence, for an assertion message a reader can act on. */
  readonly message: string;
}

/** Every visible string of one rendering, joined — value, count and note. */
function textOf(rendering: Rendering): string {
  return [rendering.value, rendering.count, rendering.note, ...rendering.bars.map((bar) => bar.text)]
    .filter((part): part is string => part !== undefined)
    .join(' \u0000 ');
}

/**
 * Every way this item list fails § 4, or an empty array.
 *
 * Total over the list: it does not stop at the first violation, because *"the reason for the
 * `abandoned` row is missing"* and *"the `stranded` row is missing entirely"* are two findings and
 * a caller that only ever saw the first would fix it and think it was done.
 */
export function parityViolations(items: readonly DisclosureItem[]): readonly ParityViolation[] {
  const violations: ParityViolation[] = [];
  const advanced = new Map(itemsIn(items, 'advanced').map((item) => [item.id, item.rendering]));
  const basic = new Map(itemsIn(items, 'basic').map((item) => [item.id, item.rendering]));

  for (const item of items) {
    const inAdvanced = advanced.get(item.id);
    const inBasic = basic.get(item.id);
    if (inAdvanced === undefined) continue;

    /* Every rule applies to the non-negotiable list, and to nothing else. */
    if (disclosureClassOf(item.origin) !== 'must-show') continue;

    if (inBasic === undefined) {
      violations.push(
        violation(
          item,
          'hidden-in-basic',
          textOf(inAdvanced),
          `Basic hides "${item.id}" (${item.origin.kind}), which Advanced draws as ` +
            `"${inAdvanced.value}". § 4: Basic mode may hide complexity; it may never hide a ` +
            'failure.',
        ),
      );
      continue;
    }

    const basicText = textOf(inBasic);
    for (const required of item.mustCarry) {
      if (required === '' || basicText.includes(required)) continue;
      violations.push(
        violation(
          item,
          'dropped-text',
          required,
          `Basic draws "${item.id}" (${item.origin.kind}) without the text the run produced for ` +
            `it: ${JSON.stringify(required)}. § 4 / R3: the reason may be shortened and may not ` +
            'be removed.',
        ),
      );
    }

    if (inAdvanced.severity === 'warning' && inBasic.severity !== 'warning') {
      violations.push(
        violation(
          item,
          'de-escalated',
          item.label,
          `Basic draws "${item.id}" (${item.origin.kind}) as "${inBasic.severity}" where ` +
            'Advanced draws it as a warning. The words survived and the signal did not, which is ' +
            '§ 4 broken in the stylesheet.',
        ),
      );
    }
  }

  return violations;
}

function violation(
  item: DisclosureItem,
  rule: ParityViolation['rule'],
  detail: string,
  message: string,
): ParityViolation {
  return { itemId: item.id, originKind: item.origin.kind, rule, detail, message };
}

/**
 * The violations as one message, or `undefined`.
 *
 * For a caller that wants to refuse rather than enumerate — the panels use it to put the failure
 * on screen rather than swallowing it, which is the same instinct `runSummaryFigures` has about a
 * figure missing from `FIGURE_ORDER`.
 */
export function parityRefusal(items: readonly DisclosureItem[]): string | undefined {
  const violations = parityViolations(items);
  if (violations.length === 0) return undefined;
  return (
    `mode parity is broken in ${String(violations.length)} place` +
    `${violations.length === 1 ? '' : 's'}: ` +
    violations.map((entry) => entry.message).join(' ')
  );
}
