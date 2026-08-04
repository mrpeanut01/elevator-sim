/**
 * The Scenarios surface — `docs/12-design-handoff.md` § 1.3 **M7**.
 *
 * ## Five cards, and not one authored number on them
 *
 * The handoff draws five scenario cards over a re-authored `PRESETS` table: each entry restates its
 * building's floors, cars, rated speed and population inline, with rounded heights and populations,
 * beside a hard-coded stat line. § 4.4 refuses that, and the refusal is the whole reason this file
 * is careful:
 *
 * > *Where a handoff stat line disagrees with the file, **the file wins** and the line is generated
 * > from it.*
 *
 * So {@link scenarioCardsOf} takes the {@link ResolvedBuilding} the reader is actually about to run
 * and asks `shift/contracts.ts`'s `statLineOf` for the line. Nothing here counts a floor, a car or a
 * person. That matters beyond pedantry: the card and the building it describes would otherwise be
 * two copies of the same facts, which is the defect class this repository has closed eleven times in
 * code and once in `data/` — and it is what makes the line true *of the day being played*, because a
 * building the reader edited in the elevation resolves to a different `ResolvedBuilding` and the card
 * moves with it.
 *
 * What **is** taken from the handoff, because it is the deliverable, is the prose (which lives on
 * {@link ScenarioContract} and is byte-for-byte the design's) and the art swatch — the five CSS
 * gradients from `design.html`'s `PRESETS[*].art`, which are decoration and carry no claim.
 *
 * ## All five are open, and there is no state in which they are not
 *
 * `contractStatus` has three answers and none of them is `locked`; the design's own unlock ladder is
 * disabled at its head with the comment *"scenarios teach, they do not gate"*, and § 1.5 B4 restates
 * it. This module therefore has no disabled card and no lock glyph — a card is *cleared*, *current*
 * or *open*, and every one of them is clickable. Porting a branch the design disabled is how a gate
 * arrives by accident.
 *
 * ## The pure part and the dumb part
 *
 * As in `dev/reportPanel.ts`: there is no jsdom here (`vitest.config.ts` is `environment: 'node'`),
 * so every decision — the status glyph, its colour, the objective sentence, the stat line, the art —
 * is {@link scenarioCardsOf}'s, and {@link mountScenarios} only instantiates it.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import { BLANK_SPEC } from '../authoring/buildingSpec.js';
import { CONTRACTS, contractStatus, statLineOf } from '../shift/contracts.js';
import type { ContractStatus, ScenarioContract, WeekState } from '../shift/types.js';
import { takeContract } from '../shift/week.js';

import { el, fill } from './dom.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';

/* -------------------------------------------------------------------------- *
 * The art — the only thing taken from the handoff's PRESETS table
 * -------------------------------------------------------------------------- */

/**
 * The five swatches, verbatim from `design.html`'s `PRESETS[*].art`, keyed by building id.
 *
 * Keyed on an id, which `dev/dom.ts` forbids its *helpers* from doing — and this is not one of
 * those. The rule there is that no shared component may key on a metric or a goal kind, because a
 * metric list in the UI is a list that goes stale. This is per-building decoration authored by the
 * design for these five buildings, it makes no claim about any of them, and a building the design
 * never drew — one the reader built — falls through to {@link FALLBACK_ART} rather than to nothing.
 */
export const SCENARIO_ART: Readonly<Record<string, string>> = Object.freeze({
  'midtown-office':
    'linear-gradient(180deg,#1d2735,#131924 70%),repeating-linear-gradient(90deg,#0000 0 6px,#ffffff08 6px 8px)',
  'garden-apartments': 'linear-gradient(180deg,#22301f,#131924 70%)',
  'secure-tower': 'linear-gradient(180deg,#2a2230,#131924 70%)',
  'mixed-use-high-rise': 'linear-gradient(180deg,#1b2a33,#131924 70%)',
  'vertical-city': 'linear-gradient(180deg,#241f33,#131924 70%)',
  // The three buildings that landed after the handoff was drawn (`docs/12` § 4.7). The design has
  // no swatch for them, so these are authored in its idiom rather than copied from it: the same
  // `#131924` base at 70 %, a hue that reads as the building's character, and no second layer —
  // Midtown Office's window stripe is the design's own and is not imitated here.
  'chancery-house': 'linear-gradient(180deg,#2e2a1d,#131924 70%)',
  'crown-hotel': 'linear-gradient(180deg,#2b2027,#131924 70%)',
  'st-jude-hospital': 'linear-gradient(180deg,#1d2f2c,#131924 70%)',
});

/** The *build your own* swatch, and the swatch for any building the design never drew. */
export const FALLBACK_ART = 'linear-gradient(180deg,#1a2430,#10151e 70%)';

/* -------------------------------------------------------------------------- *
 * The card
 * -------------------------------------------------------------------------- */

/** One scenario card, ready to instantiate. Every string on it is derived or authored upstream. */
export interface ScenarioCardView {
  readonly contractId: string;
  readonly buildingId: string;
  /** `Scenario 1`. The eyebrow. */
  readonly label: string;
  /** `Learn the ropes`. The scenario's own name. */
  readonly title: string;
  /** The **building's** name, from the file. `Garden Apartments`, not the scenario's title. */
  readonly name: string;
  readonly brief: string;
  /** `6 floors · 2 cars · 0.63 m/s · 120 people` — `statLineOf`, never a literal. § 4.4. */
  readonly statLine: string;
  /** `Clear 2 shifts — 1 of 2 banked`, or `Cleared`. */
  readonly objective: string;
  /** What clearing it hands back. The contract's own sentence. */
  readonly reward: string;
  /** `Teaches zoning, and calls nobody may legally answer`. */
  readonly teaches: string;
  readonly status: ContractStatus;
  /** `✓`, `▸` or `○`. Never the only signal — the status word rides in {@link help}. KB-15. */
  readonly glyph: string;
  readonly glyphColour: string;
  readonly art: string;
  readonly current: boolean;
  /** The `title`, naming the status in words and saying what a click does. */
  readonly help: string;
  /**
   * `false` when the contract's `buildingId` resolves to nothing loaded.
   *
   * `contracts.test.ts` asserts all five resolve against `data/buildings/`, so this is unreachable
   * from the shipped set — but a reader who has deleted a building file, or a stale id in restored
   * state, must get a card that says so rather than a card that invents a spec for it. An
   * unresolved card is drawn and refuses the click; it is not silently dropped.
   */
  readonly resolved: boolean;
}

/** The design's three status treatments (`design.html` :2676). There is no fourth. */
function statusDressing(status: ContractStatus): {
  readonly glyph: string;
  readonly colour: string;
} {
  switch (status) {
    case 'cleared':
      return { glyph: '✓', colour: 'var(--ok)' };
    case 'current':
      return { glyph: '▸', colour: 'var(--accent)' };
    case 'open':
      return { glyph: '○', colour: 'var(--dim)' };
  }
}

/** `Clear 2 shifts — 1 of 2 banked`, the design's own sentence (`design.html` :2675). */
function objectiveOf(
  contract: ScenarioContract,
  week: WeekState,
  status: ContractStatus,
): string {
  if (status === 'cleared') return 'Cleared';
  const plural = contract.needClean === 1 ? '' : 's';
  // SC-05 (§ D198): `cleanRun` can outrun `needClean` on a week that kept playing, and the line
  // would count "2 of 1". Clamped on the display only — the week's own count is not touched.
  const banked =
    status === 'current'
      ? ` — ${String(Math.min(week.cleanRun, contract.needClean))} of ${String(contract.needClean)} banked`
      : '';
  return `Clear ${String(contract.needClean)} shift${plural}${banked}`;
}

/**
 * The five cards, in the handoff's order.
 *
 * `buildings` is whatever the page has loaded — `BrowserResources.buildings`, or a
 * `LoadedConfig`'s. Looked up by id rather than by index, so the curriculum's order (zoning before
 * transfers) and `data/buildings/`'s alphabetical load order stay independent facts.
 */
export function scenarioCardsOf(
  contracts: readonly ScenarioContract[],
  week: WeekState,
  buildings: readonly ResolvedBuilding[],
): readonly ScenarioCardView[] {
  return contracts.map((contract) => {
    const building = buildings.find((candidate) => candidate.id === contract.buildingId);
    const status = contractStatus(week, contract.id);
    const { glyph, colour } = statusDressing(status);
    const resolved = building !== undefined;
    return {
      contractId: contract.id,
      buildingId: contract.buildingId,
      label: contract.label,
      title: contract.title,
      name: building?.name ?? contract.buildingId,
      brief: contract.brief,
      statLine: resolved
        ? // The whole of § 4.4, in one call. Nothing here counts anything.
          statLineOf(building)
        : `no building “${contract.buildingId}” is loaded — nothing to describe`,
      objective: objectiveOf(contract, week, status),
      /*
       * The design puts `'Teaches: ' + c.teaches` in this slot and `'Teaches ' + c.teaches` in the
       * next one, which prints the same sentence twice. `ScenarioContract` carries both a `reward`
       * (what clearing it hands back) and a `teaches`, so the duplicate is resolved in the obvious
       * direction rather than reproduced.
       */
      reward: contract.reward,
      teaches: `Teaches ${contract.teaches}`,
      status,
      glyph,
      glyphColour: colour,
      art: SCENARIO_ART[contract.buildingId] ?? FALLBACK_ART,
      current: status === 'current',
      help: resolved
        ? `${statusWord(status)} — taking this assignment restarts the week on ${building.name}`
        : `${statusWord(status)} — this scenario's building is not loaded, so it cannot be run`,
      resolved,
    };
  });
}

/** The status in words. The glyph is the shorthand; this is the message. KB-15. */
function statusWord(status: ContractStatus): string {
  switch (status) {
    case 'cleared':
      return 'Cleared';
    case 'current':
      return 'You are here';
    case 'open':
      return 'Open';
  }
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/** The dashed sixth card's copy, verbatim from `design.html` :787–794. */
const OWN_CARD = Object.freeze({
  eyebrow: 'YOUR OWN',
  title: 'Build your own scenario',
  cta: 'Start from a blank tower',
  brief:
    'Draw the building, set the arrival pattern, choose the machines — then run it and see how ' +
    'long your dispatcher copes. Nothing is graded; the goals go quiet.',
});

/**
 * Mount the five cards and the dashed sixth.
 *
 * `list` is `Elements.scenarioList` — the one element this surface owns.
 */
export function mountScenarios(list: HTMLElement, context: MountContext): Panel {
  const doc = list.ownerDocument;
  let latest: ViewAt | undefined;

  /**
   * Take an assignment.
   *
   * Five things, in this order, because the order is the dependency: the week restarts on the new
   * contract (`week.ts` rule 2 — the streak and the banked count reset, `completed` survives), the
   * runner moves to that contract's building, anything the reader had taken out of service on the
   * *previous* building is released — a car id from Vertical City means nothing on Garden
   * Apartments — the old recording and its report are dropped so the sheet cannot show yesterday's
   * figures against today's assignment, and only then is the shift run.
   */
  function take(card: ScenarioCardView): void {
    const view = latest;
    if (view === undefined || !card.resolved) return;
    context.update({
      week: takeContract(view.state.week, card.contractId),
      buildingId: card.buildingId,
      outOfServiceCarIds: [],
      recording: undefined,
      report: undefined,
      withheld: [],
    });
    context.openTab('run');
    context.runShift();
  }

  /**
   * *Build your own scenario.*
   *
   * Loads the blank tower into the building editor's working copy and opens it. It deliberately
   * does **not** change what is running: the reader has not built anything yet, and switching the
   * runner to a building that does not exist would empty the stage behind the editor.
   */
  function startOwn(): void {
    context.update({ buildingSpec: BLANK_SPEC, editingBuildingId: BLANK_SPEC.id });
    context.openTab('building');
  }

  function cardNode(card: ScenarioCardView): HTMLElement {
    const head = el(doc, 'div', {
      className: 'scenario-line',
      children: [
        el(doc, 'span', {
          text: card.glyph,
          style: { color: card.glyphColour, font: '600 12px var(--mono)', flex: 'none' },
        }),
        el(doc, 'span', { className: 'eyebrow', text: card.label }),
        el(doc, 'span', { text: card.title, style: { 'font-size': '15px', 'font-weight': '600' } }),
        el(doc, 'span', {
          text: card.name,
          style: { font: '500 11px var(--mono)', color: 'var(--dim)' },
        }),
      ],
    });
    const stats = el(doc, 'div', {
      className: 'scenario-stats',
      children: [
        el(doc, 'span', { text: card.statLine, style: { color: 'var(--dimmer)' } }),
        el(doc, 'span', { text: card.objective, style: { color: 'var(--accent-soft)' } }),
        el(doc, 'span', { text: card.reward, style: { color: 'var(--measured)' } }),
        el(doc, 'span', { text: card.teaches, style: { color: 'var(--dimmer)' } }),
      ],
    });
    const node = el(doc, 'button', {
      className: 'scenario',
      title: card.help,
      attrs: { type: 'button', 'aria-current': card.current ? 'true' : 'false' },
      children: [
        el(doc, 'div', { className: 'scenario-art', style: { background: card.art } }),
        el(doc, 'div', {
          className: 'scenario-body',
          children: [head, el(doc, 'p', { className: 'scenario-brief', text: card.brief }), stats],
        }),
      ],
    });
    node.disabled = !card.resolved;
    node.addEventListener('click', () => {
      take(card);
    });
    return node;
  }

  function ownNode(): HTMLElement {
    const head = el(doc, 'div', {
      className: 'scenario-line',
      children: [
        el(doc, 'span', {
          text: '+',
          style: { color: 'var(--dim)', font: '600 12px var(--mono)', flex: 'none' },
        }),
        el(doc, 'span', { className: 'eyebrow', text: OWN_CARD.eyebrow }),
        el(doc, 'span', {
          text: OWN_CARD.title,
          style: { 'font-size': '15px', 'font-weight': '600' },
        }),
        el(doc, 'span', {
          text: OWN_CARD.cta,
          style: {
            'margin-left': 'auto',
            font: '600 11.5px var(--mono)',
            color: 'var(--accent-soft)',
          },
        }),
      ],
    });
    const node = el(doc, 'button', {
      className: 'scenario scenario-own',
      attrs: { type: 'button' },
      children: [
        el(doc, 'div', { className: 'scenario-art', style: { background: FALLBACK_ART } }),
        el(doc, 'div', {
          className: 'scenario-body',
          children: [head, el(doc, 'p', { className: 'scenario-brief', text: OWN_CARD.brief })],
        }),
      ],
    });
    node.addEventListener('click', startOwn);
    return node;
  }

  return {
    render(view: ViewAt): void {
      latest = view;
      const cards = scenarioCardsOf(CONTRACTS, view.state.week, view.resources.buildings);
      fill(list, ...cards.map(cardNode), ownNode());
    },
  };
}
