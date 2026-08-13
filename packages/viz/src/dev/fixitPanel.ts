/**
 * Fix-a-building — the mounted surface. GAMEPLAY § 10's screen over `fixit/`'s pure model.
 *
 * ## The mount
 *
 * An overlay built in TypeScript and appended to `document.body`, on `menuRoot`'s own precedent
 * in `dev/main.ts`: `index.html` is untouched, so `elementMap.test.ts`'s contract over the page's
 * required shape is untouched too. Styling is inline for `waitLiveRegion`'s stated reason — the
 * stylesheet is not this lane's to edit.
 *
 * ## What this file decides: nothing
 *
 * Every decision — spend, affordability, the four outcomes, the measured rows — is
 * `fixit/engine.ts`'s and `fixit/run.ts`'s, and the validation suite drives those directly. This
 * file draws their answers and forwards presses. It is DOM-bound and therefore outside the
 * honesty search's driven corpus; its exclusion is stated in `honesty/derive.test.ts` beside the
 * other mounts, and the strings it prints come from the engine, the case file, or the figure
 * producers, all of which are driven.
 *
 * ## The runs happen on the main thread, and that is a stated cost
 *
 * `recordRun` here takes ~0.5 s per run on the largest shipped case. The shift surface moved its
 * runs to a worker (B3); this panel keeps the two-run pair synchronous with the button disabled
 * and relabelled while it computes, because a worker round-trip for a surface whose whole output
 * is one before/after sheet is complexity the first slice does not need. Named in the delivery
 * report as a limitation.
 */

import { el, fill } from './dom.js';
import type { BrowserResources } from './data.js';
import {
  BASIS_LINE,
  EDITOR_PRICING,
  STANDING_EXTRAS,
  affordabilityOf,
  budgetNoteOf,
  classifyOutcome,
  emptyFixitState,
  fixedBadgeAfter,
  repairRowOf,
  spendOf,
  stepCapacity,
  stepSpeed,
  toggleExtra,
  toggleRepair,
  type FixitOutcome,
} from '../fixit/engine.js';
import { figureValuesOf, fixitRunPlanOf, measuredOf, runFixitPair } from '../fixit/run.js';
import type { FixitCase, FixitCases, FixitState } from '../fixit/types.js';
import type { RecordedRun } from '../record/recordRun.js';

export interface FixitPanelHost {
  readonly document: Document;
  readonly resources: BrowserResources;
  /** Fetch-and-parse, once, on first open — `dev/data.ts#loadFixitCases`. */
  readonly loadCases: () => Promise<FixitCases>;
}

export interface FixitPanel {
  open(): void;
  close(): void;
  /** The overlay root `mountFixitPanel` appended — what {@link close} hides. */
  readonly root: HTMLElement;
}

interface CaseSession {
  state: FixitState;
  fixed: boolean;
  outcome: FixitOutcome | undefined;
  asBuilt: RecordedRun | undefined;
}

/*
 * The product's own tokens, not a palette of this file's own — `docs/20` defect 16's third
 * finding. The first slice hardcoded six dark hexes, which drew a dark room inside a light
 * product (and would have drawn a wrong-looking light one inside the dark theme the moment the
 * player flipped it). `dev/main.ts#applyTheme` writes every token inline on `:root`, so reading
 * them here is what makes this overlay follow the same switch every other surface follows.
 */
const PANEL_BG = 'var(--bg)';
const CARD_BG = 'var(--card)';
const INK = 'var(--text)';
const MUTED = 'var(--dim)';
const BAD = 'var(--bad)';
const GOOD = 'var(--ok)';

export function mountFixitPanel(host: FixitPanelHost): FixitPanel {
  const doc = host.document;
  const root = el(doc, 'div', {
    className: 'fixit-overlay',
    style: {
      position: 'fixed',
      inset: '0',
      display: 'none',
      'z-index': '40',
      background: PANEL_BG,
      color: INK,
      overflow: 'auto',
      font: '14px/1.45 system-ui, sans-serif',
    },
  });
  doc.body.append(root);

  let cases: FixitCases | undefined;
  let loadFailure: string | undefined;
  let selectedId: string | undefined;
  const sessions = new Map<string, CaseSession>();

  const sessionOf = (entry: FixitCase): CaseSession => {
    let session = sessions.get(entry.id);
    if (session === undefined) {
      session = { state: emptyFixitState(), fixed: false, outcome: undefined, asBuilt: undefined };
      sessions.set(entry.id, session);
    }
    return session;
  };

  const close = (): void => {
    root.style.display = 'none';
  };

  doc.addEventListener('keydown', (event) => {
    // Escape closes, § D188's rule for every dismissable surface.
    if (event.key === 'Escape' && root.style.display !== 'none') close();
  });

  const open = (): void => {
    root.style.display = 'block';
    if (cases === undefined && loadFailure === undefined) {
      fill(root, el(doc, 'p', { text: 'Loading the case file…', style: { padding: '2rem' } }));
      host
        .loadCases()
        .then((loaded) => {
          cases = loaded;
          selectedId = loaded.cases[0]?.id;
          render();
        })
        .catch((error: unknown) => {
          loadFailure = error instanceof Error ? error.message : String(error);
          render();
        });
      return;
    }
    render();
  };

  function render(): void {
    if (loadFailure !== undefined) {
      fill(
        root,
        el(doc, 'div', {
          style: { padding: '2rem', 'max-width': '48rem' },
          children: [
            el(doc, 'h1', { text: 'Fix a building' }),
            el(doc, 'p', { text: `The case file could not be loaded: ${loadFailure}` }),
            closeButton(),
          ],
        }),
      );
      return;
    }
    if (cases === undefined) return;
    const entry = cases.cases.find((candidate) => candidate.id === selectedId) ?? cases.cases[0];
    if (entry === undefined) {
      fill(root, el(doc, 'p', { text: 'The case file holds no cases.', style: { padding: '2rem' } }), closeButton());
      return;
    }
    const fixedCount = cases.cases.filter((candidate) => sessions.get(candidate.id)?.fixed === true).length;
    fill(
      root,
      el(doc, 'div', {
        style: { display: 'flex', 'min-height': '100%' },
        children: [rail(cases, entry, fixedCount), main(entry)],
      }),
    );
  }

  function closeButton(): HTMLButtonElement {
    const button = el(doc, 'button', {
      text: 'Back to the tower',
      style: buttonStyle(false),
    });
    button.addEventListener('click', close);
    return button;
  }

  function rail(loaded: FixitCases, current: FixitCase, fixedCount: number): HTMLElement {
    return el(doc, 'div', {
      style: {
        width: '288px',
        'flex-shrink': '0',
        padding: '1.25rem 1rem',
        'border-right': '1px solid var(--edge)',
      },
      children: [
        el(doc, 'p', {
          text: `${String(fixedCount)}/${String(loaded.cases.length)} fixed`,
          style: { color: MUTED, margin: '0 0 0.75rem' },
        }),
        ...loaded.cases.map((entry) => {
          const session = sessions.get(entry.id);
          const row = el(doc, 'button', {
            style: {
              ...buttonStyle(entry.id === current.id),
              display: 'block',
              width: '100%',
              'text-align': 'left',
              'margin-bottom': '0.5rem',
            },
            children: [
              el(doc, 'div', { text: entry.name }),
              el(doc, 'div', {
                text: `${buildingNameOf(entry)} · ${session?.fixed === true ? 'FIXED' : 'OPEN'}`,
                style: { color: MUTED, 'font-size': '12px' },
              }),
            ],
          });
          row.addEventListener('click', () => {
            selectedId = entry.id;
            render();
          });
          return row;
        }),
        el(doc, 'div', { style: { 'margin-top': '1rem' }, children: [closeButton()] }),
      ],
    });
  }

  function buildingNameOf(entry: FixitCase): string {
    return (
      host.resources.buildings.find((building) => building.id === entry.buildingId)?.name ??
      'a building'
    );
  }

  function main(entry: FixitCase): HTMLElement {
    const session = sessionOf(entry);
    if (session.asBuilt === undefined) {
      // The four figures are measurements of the as-built run, so the case opens by taking one.
      session.asBuilt = runFixitPair(fixitRunPlanOf(entry, emptyFixitState(), host.resources)).before;
    }
    const spend = spendOf(entry, session.state);
    const figures = figureValuesOf(entry, session.asBuilt.recording);
    return el(doc, 'div', {
      style: { flex: '1', padding: '1.5rem', 'max-width': '52rem' },
      children: [
        el(doc, 'h1', { text: entry.name, style: { margin: '0 0 0.25rem' } }),
        el(doc, 'p', { text: buildingNameOf(entry), style: { color: MUTED, margin: '0 0 1rem' } }),
        card([
          el(doc, 'p', { text: `“${entry.complaint.text}”`, style: { margin: '0 0 0.25rem' } }),
          el(doc, 'p', { text: `— ${entry.complaint.complainer}`, style: { color: MUTED, margin: '0' } }),
        ]),
        card([
          el(doc, 'p', { text: entry.asBuilt.note, style: { margin: '0 0 0.25rem' } }),
          el(doc, 'p', {
            text: entry.symptom,
            style: { color: BAD, margin: '0' },
          }),
        ]),
        card(
          figures.map((figure) =>
            el(doc, 'div', {
              style: { display: 'flex', 'justify-content': 'space-between', gap: '1rem' },
              children: [
                el(doc, 'span', { text: figure.label, style: { color: MUTED } }),
                el(doc, 'span', {
                  text: figure.text,
                  style: figure.reading === 'bad' ? { color: BAD } : {},
                }),
              ],
            }),
          ),
        ),
        card([
          el(doc, 'p', { text: entry.diagnosis.text, style: { margin: '0 0 0.5rem', 'font-weight': '600' } }),
          el(doc, 'p', { text: entry.diagnosis.reasoning, style: { color: MUTED, margin: '0' } }),
        ]),
        el(doc, 'h2', { text: 'Quick repairs', style: h2Style() }),
        ...entry.repairs.map((repair) => repairToggle(entry, session, repair.id)),
        el(doc, 'h2', { text: 'Also on offer', style: h2Style() }),
        ...STANDING_EXTRAS.map((extra) => extraToggle(entry, session, extra.id)),
        el(doc, 'h2', { text: 'Machinery, priced against the same budget', style: h2Style() }),
        stepperRow(entry, session, 'speed'),
        stepperRow(entry, session, 'capacity'),
        el(doc, 'p', {
          text: `${String(spend.totalUnits)} of ${String(entry.budgetUnits)} u committed, ${String(spend.machineryUnits)} u of it machinery — ${budgetNoteOf(entry, spend)}`,
          style: { color: MUTED },
        }),
        runButton(entry, session),
        ...(session.outcome === undefined ? [] : [outcomeCard(session.outcome)]),
      ],
    });
  }

  function card(children: readonly (Node | null)[]): HTMLElement {
    return el(doc, 'div', {
      style: {
        background: CARD_BG,
        'border-radius': '8px',
        padding: '0.9rem 1rem',
        'margin-bottom': '0.75rem',
      },
      children,
    });
  }

  function h2Style(): Record<string, string> {
    return { 'font-size': '15px', margin: '1.1rem 0 0.5rem' };
  }

  function buttonStyle(active: boolean): Record<string, string> {
    return {
      background: active ? 'var(--raised)' : CARD_BG,
      color: INK,
      border: `1px solid ${active ? 'var(--edge-strong)' : 'var(--edge)'}`,
      'border-radius': '6px',
      padding: '0.5rem 0.75rem',
      cursor: 'pointer',
    };
  }

  function repairToggle(entry: FixitCase, session: CaseSession, repairId: string): HTMLElement {
    const repair = entry.repairs.find((candidate) => candidate.id === repairId);
    if (repair === undefined) return el(doc, 'div');
    const row = repairRowOf(entry, session.state, repair);
    const button = el(doc, 'button', {
      // The class is the browser tier's handle (`fixit.browser.test.ts`); nothing styles it.
      className: 'fixit-repair',
      style: {
        ...buttonStyle(row.selected),
        display: 'block',
        width: '100%',
        'text-align': 'left',
        'margin-bottom': '0.5rem',
        ...(row.selectable ? {} : { opacity: '0.55', cursor: 'not-allowed' }),
      },
      children: [
        el(doc, 'div', {
          style: { display: 'flex', 'justify-content': 'space-between', gap: '1rem' },
          children: [
            el(doc, 'span', { children: [tickMark(row.selected), doc.createTextNode(repair.name)] }),
            el(doc, 'span', { text: row.priceLine, style: { color: MUTED } }),
          ],
        }),
        el(doc, 'div', { text: repair.effect, style: { color: MUTED, 'font-size': '12px' } }),
        ...(row.refusal === undefined
          ? []
          : [el(doc, 'div', { text: row.refusal, style: { color: BAD, 'font-size': '12px' } })]),
      ],
    });
    // A toggle says which state it is in — docs/20 defect 16. `aria-pressed` is the platform's
    // word for it, and the tick above is the sighted reader's; a background colour alone was both
    // registers' silence.
    button.setAttribute('aria-pressed', String(row.selected));
    button.disabled = !row.selectable;
    button.addEventListener('click', () => {
      session.state = toggleRepair(entry, session.state, repair.id);
      render();
    });
    return button;
  }

  /**
   * The selected mark, present in the layout in both states — `docs/20` defect 16.
   *
   * A visible tick when selected and a fixed-width blank when not, so rows do not reflow as they
   * toggle. `aria-hidden` because the state's accessible register is the button's own
   * `aria-pressed`, set beside it; a glyph read out as "check mark" over a pressed-state the
   * reader was already told would be the same fact twice in different words.
   */
  function tickMark(selected: boolean): HTMLElement {
    return el(doc, 'span', {
      text: selected ? '✓ ' : '',
      attrs: { 'aria-hidden': 'true' },
      style: { display: 'inline-block', width: '1.1em', color: GOOD, 'font-weight': '600' },
    });
  }

  function extraToggle(entry: FixitCase, session: CaseSession, extraId: string): HTMLElement {
    const extra = STANDING_EXTRAS.find((candidate) => candidate.id === extraId);
    if (extra === undefined) return el(doc, 'div');
    const selected = session.state.selectedExtraIds.includes(extra.id);
    const affordability = affordabilityOf(entry, session.state, extra.costUnits);
    const selectable = selected || affordability.selectable;
    const button = el(doc, 'button', {
      className: 'fixit-extra',
      style: {
        ...buttonStyle(selected),
        display: 'block',
        width: '100%',
        'text-align': 'left',
        'margin-bottom': '0.5rem',
        ...(selectable ? {} : { opacity: '0.55', cursor: 'not-allowed' }),
      },
      children: [
        el(doc, 'div', {
          style: { display: 'flex', 'justify-content': 'space-between', gap: '1rem' },
          children: [
            el(doc, 'span', { children: [tickMark(selected), doc.createTextNode(extra.name)] }),
            el(doc, 'span', { text: `${String(extra.costUnits)} u`, style: { color: MUTED } }),
          ],
        }),
        el(doc, 'div', { text: extra.line, style: { color: MUTED, 'font-size': '12px' } }),
        ...(selectable
          ? []
          : [
              el(doc, 'div', {
                text: `short by ${String(affordability.shortByUnits)} u`,
                style: { color: BAD, 'font-size': '12px' },
              }),
            ]),
      ],
    });
    // The same toggle contract the repair rows carry — one control kind, one register.
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !selectable;
    button.addEventListener('click', () => {
      session.state = toggleExtra(entry, session.state, extra.id);
      render();
    });
    return button;
  }

  function stepperRow(entry: FixitCase, session: CaseSession, which: 'speed' | 'capacity'): HTMLElement {
    const steps = which === 'speed' ? session.state.speedSteps : session.state.capacitySteps;
    const price = which === 'speed' ? EDITOR_PRICING.speedUnitsPerHalfMps : EDITOR_PRICING.capacityUnitsPerTwoPlaces;
    const canBuy = affordabilityOf(entry, session.state, price).selectable;
    const label =
      which === 'speed'
        ? `Rated speed · ${String(price)} u per half a metre per second · +${(steps * 0.5).toFixed(1)} m/s`
        : `Car capacity · ${String(price)} u per two places · +${String(steps * 2)} places`;
    const minus = el(doc, 'button', { text: '−', style: buttonStyle(false) });
    const plus = el(doc, 'button', { text: '+', style: buttonStyle(false) });
    minus.disabled = steps === 0;
    plus.disabled = !canBuy;
    if (!canBuy) plus.title = 'at the budget';
    minus.addEventListener('click', () => {
      session.state = which === 'speed' ? stepSpeed(entry, session.state, -1) : stepCapacity(entry, session.state, -1);
      render();
    });
    plus.addEventListener('click', () => {
      session.state = which === 'speed' ? stepSpeed(entry, session.state, 1) : stepCapacity(entry, session.state, 1);
      render();
    });
    return el(doc, 'div', {
      style: { display: 'flex', 'align-items': 'center', gap: '0.5rem', 'margin-bottom': '0.5rem' },
      children: [
        minus,
        plus,
        el(doc, 'span', { text: `${label}${canBuy ? '' : ' — at the budget'}`, style: { color: MUTED } }),
      ],
    });
  }

  function runButton(entry: FixitCase, session: CaseSession): HTMLElement {
    const button = el(doc, 'button', {
      // Named for the same reason `.fixit-repair` is: the tier selects a control by its class and
      // never by the prose a player reads, which is a lesson this file's sibling paid for once.
      className: 'fixit-run',
      text: session.outcome === undefined ? 'Run the day' : 'Run it again',
      style: { ...buttonStyle(true), 'font-weight': '600', margin: '0.75rem 0' },
    });
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Running the day…';
      /*
       * Deferred **past a paint** so the relabel is on screen before the synchronous pair of runs
       * blocks the thread.
       *
       * ## The comment that used to sit here described a mechanism this code did not have
       *
       * It read *"deferred one frame so the relabel paints before the synchronous pair of runs"*,
       * over a bare `setTimeout(…, 0)`. A zero timeout schedules a **task**, not a frame: the
       * browser may run it before the next paint, and the task then blocks the main thread for the
       * length of two `recordRun` calls — 0.5–1.5 s on the shipped buildings. So the two writes
       * above reached the DOM and were overwritten by `render()` below without ever being painted,
       * and the disabled, relabelled button — the only thing stopping a second press mid-run —
       * existed for nobody.
       *
       * It was measured rather than reasoned about, and not here: `everyday/fixitScreen.ts` carried
       * this approach over verbatim, and its browser case waited fifteen seconds for a button
       * reading `Running the day…` on a run that takes seconds and never saw one.
       *
       * `requestAnimationFrame` runs its callback **before** the paint that follows it, and a
       * `setTimeout` inside that callback runs after — which is the first moment the relabel is
       * guaranteed to be on screen. Nesting the two is the whole fix. `everyday/fixitScreen.ts`'s
       * `afterPaint` holds the same argument at more length; this panel is where the mistake was.
       */
      requestAnimationFrame(() => {
        setTimeout(() => {
          const plan = fixitRunPlanOf(entry, session.state, host.resources);
          const pair = runFixitPair(plan);
          session.asBuilt = pair.before;
          const measurement = measuredOf(entry, pair.before.recording, pair.after.recording);
          const outcome = classifyOutcome(entry, measurement, spendOf(entry, session.state));
          session.outcome = outcome;
          // The badge follows the latest run, in both directions — `fixit/engine.ts#fixedBadgeAfter`
          // holds the argument (docs/20 defect 16: FIXED beside a 0 % outcome card is two verdicts
          // about one case on one screen).
          session.fixed = fixedBadgeAfter(outcome);
          render();
        }, 0);
      });
    });
    return el(doc, 'div', { children: [button] });
  }

  function outcomeCard(outcome: FixitOutcome): HTMLElement {
    const box = card([
      el(doc, 'p', {
        text: outcome.head,
        style: { margin: '0 0 0.25rem', 'font-weight': '600', color: outcome.kind === 'fixed' ? GOOD : INK },
      }),
      el(doc, 'p', { text: outcome.body, style: { color: MUTED, margin: '0 0 0.75rem' } }),
      ...outcome.rows.map((row) =>
        el(doc, 'div', {
          className: 'fixit-outcome-row',
          style: { 'margin-bottom': '0.4rem' },
          children: [
            el(doc, 'div', {
              style: { display: 'flex', 'justify-content': 'space-between', gap: '1rem' },
              children: [
                el(doc, 'span', { text: row.label }),
                el(doc, 'span', {
                  text: row.passed ? 'holds' : 'does not hold',
                  style: { color: row.passed ? GOOD : BAD },
                }),
              ],
            }),
            el(doc, 'div', {
              text: `${row.before} → ${row.after} · ${row.verdict}`,
              style: { color: MUTED, 'font-size': '12px' },
            }),
          ],
        }),
      ),
      el(doc, 'p', { text: BASIS_LINE, style: { color: MUTED, 'font-size': '12px', margin: '0.5rem 0 0' } }),
    ]);
    // The card the tier waits on. `card()` is shared by six blocks on this screen, so the name goes
    // on the instance rather than into the helper.
    box.className = 'fixit-outcome';
    return box;
  }

  return { open, close, root };
}
