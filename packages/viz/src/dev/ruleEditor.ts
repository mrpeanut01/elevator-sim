/**
 * **The Everyday rules editor, mounted** — GAMEPLAY_AND_NAVIGATION.md §11.5's when/then rows,
 * bound to `authoring/ruleSpec.ts`, which made every modelling decision. This file is
 * presentation: which selects a row holds, where the readback and the lever line sit, and where
 * a refusal is drawn. Every decision a test needs is a pure exported function, because this
 * repository has no jsdom and a decision made inside a click handler cannot be tested.
 *
 * ## Where the rows reach a run — the only reason this panel exists
 *
 * `dev/state.ts#shiftRunConfigOf` applies `profileWithRules(profile, state.ruleRows)` **after**
 * the selector spec, so a non-empty list drives the next run under `selection.policy: 'rules'`
 * and the switching panel above says so (`selectorEditor.ts#rulesOverrideNoteOf`). An edit takes
 * effect on the next Run, never mid-run — rules are config, and the copy under the list says so
 * in §11.5's own register.
 *
 * ## What this panel refuses to draw
 *
 * The two actions §11.5 lists and `core` omits are not rows a player can build here, because the
 * select is filled from `RULE_ACTIONS` — the refusal is the vocabulary's, made once. Rows whose
 * value or pairing the compiler would refuse get their reason beside the row, in advance, from
 * `ruleIssues` — never a Run that fails blind.
 */

import type { RuleActionId, RuleConditionId, RuleValueOption } from '@elevator-sim/core/browser';
import {
  RULE_ACTIONS,
  RULE_ACTION_WORDS,
  RULE_CONDITIONS,
  RULE_CONDITION_WORDS,
} from '@elevator-sim/core/browser';

import {
  RULES_EXCLUSIVITY_NOTE,
  defaultRuleRow,
  fallbackLineOf,
  leverLineOf,
  readbackOf,
  ruleIssues,
  rowWithThen,
  rowWithWhen,
  templateHasClock,
  type RuleIssue,
  type RuleRow,
} from '../authoring/ruleSpec.js';
import { commitmentOf } from '../scope/commitment.js';

import { el, fill, setHidden, setText } from './dom.js';
import type { RuleEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { buildingConfigOf, profileById, shiftDemandTemplateId } from './state.js';

/* -------------------------------------------------------------------------- *
 * Pure view models
 * -------------------------------------------------------------------------- */

/** One select option: the id, and the template with `…` standing where the value will go. */
export interface RuleSelectOption {
  readonly id: string;
  readonly label: string;
}

/** The nine conditions as select options, in `core`'s declaration order. */
export function conditionOptions(): readonly RuleSelectOption[] {
  return RULE_CONDITIONS.map((id) => ({
    id,
    label: RULE_CONDITION_WORDS[id].template.replace('{v}', '…'),
  }));
}

/** The eight actions as select options. The two refused actions are absent because `core` omits them. */
export function actionOptions(): readonly RuleSelectOption[] {
  return RULE_ACTIONS.map((id) => ({
    id,
    label: RULE_ACTION_WORDS[id].template.replace('{v}', '…'),
  }));
}

/** The declared values for a row's condition, or `[]` for a valueless one. */
export function whenValueOptions(when: RuleConditionId): readonly RuleValueOption[] {
  return RULE_CONDITION_WORDS[when].values ?? [];
}

/** The declared values for a row's action, or `[]`. */
export function thenValueOptions(then: RuleActionId): readonly RuleValueOption[] {
  return RULE_ACTION_WORDS[then].values ?? [];
}

/** Every refusal raised against one row, as one string. Joined, not truncated. */
export function rowRefusalOf(index: number, issues: readonly RuleIssue[]): string {
  const prefix = `rows.${String(index)}.`;
  return issues
    .filter((issue) => issue.field.startsWith(prefix))
    .map((issue) => issue.message)
    .join(' ');
}

/*
 * The scope note — the same distinction `selectorEditor.ts` draws for issue #104, and it is
 * sharper here: a rule *is* a within-day mechanism (its condition is evaluated mid-run, its arm
 * takes and releases the weights while the day plays), and editing the rule list is still a
 * next-run act. The note keeps the two senses apart.
 */
const APPLIES_NEXT_RUN =
  commitmentOf('viewer.ruleRows', 'writes-only') === 'next-run'
    ? 'Rules take effect on your next run. While a day plays, the rules it was simulated with ' +
      'do the deciding — mid-run, your one instrument is the stage control, and a park ordered ' +
      'there outranks a standing rule.'
    : '';

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

export function mountRuleEditor(elements: RuleEditorElements, context: MountContext): Panel {
  const doc = elements.rows.ownerDocument;
  let view: ViewAt | undefined;
  let builtKey = '';

  const rows = (): readonly RuleRow[] => view?.state.ruleRows ?? [];

  function write(next: readonly RuleRow[]): void {
    context.update({ ruleRows: next });
  }

  if (APPLIES_NEXT_RUN !== '') {
    elements.rows.parentElement?.insertBefore(
      el(doc, 'p', { className: 'advice', text: APPLIES_NEXT_RUN, style: { 'margin-bottom': '10px' } }),
      elements.rows,
    );
  }

  elements.add.addEventListener('click', () => {
    write([...rows(), defaultRuleRow()]);
  });

  function valueSelect(
    options: readonly RuleValueOption[],
    current: number | string | undefined,
    label: string,
    onPick: (value: number | string) => void,
  ): HTMLElement | undefined {
    if (options.length === 0) return undefined;
    const select = el(doc, 'select', { attrs: { 'aria-label': label } });
    fill(
      select,
      ...options.map((option) =>
        el(doc, 'option', { text: option.label, attrs: { value: String(option.value) } }),
      ),
    );
    select.value = String(current);
    select.addEventListener('change', () => {
      const picked = options.find((option) => String(option.value) === select.value);
      if (picked !== undefined) onPick(picked.value);
    });
    return select;
  }

  function idSelect(
    options: readonly RuleSelectOption[],
    current: string,
    label: string,
    onPick: (id: string) => void,
  ): HTMLSelectElement {
    const select = el(doc, 'select', { attrs: { 'aria-label': label } });
    fill(
      select,
      ...options.map((option) => el(doc, 'option', { text: option.label, attrs: { value: option.id } })),
    );
    select.value = current;
    select.addEventListener('change', () => {
      onPick(select.value);
    });
    return select;
  }

  function buildRow(row: RuleRow, index: number, issues: readonly RuleIssue[]): HTMLElement {
    const all = rows();
    const patch = (next: RuleRow): void => {
      write(all.map((entry, at) => (at === index ? next : entry)));
    };

    const when = idSelect(conditionOptions(), row.when, `row ${String(index + 1)} condition`, (id) => {
      patch(rowWithWhen(row, id as RuleConditionId));
    });
    const whenValue = valueSelect(
      whenValueOptions(row.when),
      row.whenValue,
      `row ${String(index + 1)} condition value`,
      (value) => {
        patch({ ...row, whenValue: value });
      },
    );
    const then = idSelect(actionOptions(), row.then, `row ${String(index + 1)} action`, (id) => {
      patch(rowWithThen(row, id as RuleActionId));
    });
    const thenValue = valueSelect(
      thenValueOptions(row.then),
      row.thenValue,
      `row ${String(index + 1)} action value`,
      (value) => {
        patch({ ...row, thenValue: value });
      },
    );

    const move = (delta: number): void => {
      const target = index + delta;
      if (target < 0 || target >= all.length) return;
      const next = [...all];
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry!);
      write(next);
    };
    const button = (text: string, title: string, onClick: () => void): HTMLElement => {
      const node = el(doc, 'button', { className: 'chip', text, attrs: { type: 'button', title } });
      node.addEventListener('click', onClick);
      return node;
    };

    const refusal = rowRefusalOf(index, issues);
    return el(doc, 'div', {
      className: 'rule-row',
      children: [
        el(doc, 'div', {
          className: 'rule-row-controls',
          children: [
            el(doc, 'span', { className: 'rule-row-word', text: 'when' }),
            when,
            ...(whenValue === undefined ? [] : [whenValue]),
            el(doc, 'span', { className: 'rule-row-word', text: 'then' }),
            then,
            ...(thenValue === undefined ? [] : [thenValue]),
            button('↑', 'earlier — read sooner, wins ties', () => { move(-1); }),
            button('↓', 'later — read after the rows above', () => { move(1); }),
            button('✕', 'delete this rule', () => {
              write(all.filter((_, at) => at !== index));
            }),
          ],
        }),
        el(doc, 'div', { className: 'rule-row-readback', text: `Reads as: ${readbackOf(row)}` }),
        el(doc, 'div', { className: 'rule-row-lever', text: leverLineOf(row) }),
        ...(refusal === ''
          ? []
          : [el(doc, 'div', { className: 'selector-refusal', text: refusal })]),
      ],
    });
  }

  function render(at: ViewAt): void {
    view = at;
    const state = at.state;
    const list = state.ruleRows;
    const templateId = shiftDemandTemplateId(
      at.resources,
      state,
      buildingConfigOf(at.resources, state.savedBuildings, state.buildingId),
    );
    const issues = ruleIssues(list, {
      hasClock: templateHasClock(at.resources.trafficProfiles, templateId),
    });
    const style = profileById(at.resources, state.savedDispatchers, state.dispatcherId);

    const key = JSON.stringify([list, issues, style.name]);
    if (key !== builtKey) {
      builtKey = key;
      fill(elements.rows, ...list.map((row, index) => buildRow(row, index, issues)));
    }

    setText(elements.fallback, fallbackLineOf(style.name));
    setText(elements.note, list.length === 0 ? '' : RULES_EXCLUSIVITY_NOTE);
    setHidden(elements.note, list.length === 0);
  }

  return { render };
}
