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
 * ## The runs are on a worker — GitHub issue #165
 *
 * Both of a press's runs, and the as-built run a case opens by taking, go through
 * `dev/offThreadRuns.ts` to `dev/shiftWorker.ts`. This panel used to state a cost here instead —
 * *"~0.5 s per run on the largest shipped case … a worker round-trip for a surface whose whole
 * output is one before/after sheet is complexity the first slice does not need"* — and that
 * sentence is deleted rather than reworded, because a stated cost that has been paid is § D227's
 * stale refusal: it tells the next reader not to touch the thing.
 *
 * The busy states stay, because they are still honest: the run button relabels to
 * `Running the day…` and goes inert, and the figures card says it is measuring while the case's
 * as-built run is in flight. What went with the block is the `requestAnimationFrame` +
 * `setTimeout` defer, whose whole subject was getting the relabel painted **before** a task that
 * would seize the thread for a second. There is no such task now; the click handler returns
 * immediately and the browser paints on its own schedule.
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
import { FIXIT_RUN_SWITCHES, figureValuesOf, fixitRunPlanOf, measuredOf } from '../fixit/run.js';
import type { FixitCase, FixitCases, FixitState } from '../fixit/types.js';
import type { VizRecording } from '../contract/types.js';

import { createOffThreadRunner } from './offThreadRuns.js';
import type { ShiftWorkerLike } from './shiftRunner.js';

export interface FixitPanelHost {
  readonly document: Document;
  readonly resources: BrowserResources;
  /** Fetch-and-parse, once, on first open — `dev/data.ts#loadFixitCases`. */
  readonly loadCases: () => Promise<FixitCases>;
  /**
   * Start the worker a run crosses to — `dev/offThreadRuns.ts`, GitHub issue #165.
   *
   * Injected rather than built here for `dev/shiftRunner.ts`'s reason: `new Worker(new URL(…))` is
   * a bundler seam and a DOM global, so a panel that constructed one could not be driven without a
   * document *or* a bundler. The shell passes the real one.
   */
  readonly spawnRunWorker: () => ShiftWorkerLike;
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
  /** The as-built run the figures are measurements of. `undefined` until the worker answers. */
  asBuilt: VizRecording | undefined;
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

  const runner = createOffThreadRunner({ spawn: host.spawnRunWorker });

  /**
   * What the runner is currently doing, as `caseId:open` or `caseId:press` — or `undefined`.
   *
   * One field rather than a per-session busy flag, and that is what makes the screen self-heal
   * across a supersede. `dev/offThreadRuns.ts` answers exactly one ask; a second `start` abandons
   * the first **silently**, so a flag left on the abandoned case would leave it measuring forever.
   * Keying on the ask means the next draw of that case sees an ask that is not its own and starts
   * a fresh one.
   */
  let ask: string | undefined;
  /** A failed run, said where the reader is rather than swallowed. Cleared by the next ask. */
  let runFailure: string | undefined;

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

  /**
   * The as-built run the four figures are measurements of, asked for on the case's first draw.
   *
   * Started from `main` because that is where the absence is noticed, and guarded by {@link ask}
   * so a re-render mid-flight does not queue a second one. The case redraws when it lands.
   */
  function measureAsBuilt(entry: FixitCase): void {
    const key = `${entry.id}:open`;
    /*
     * Guarded twice. An ask already running for this case is left alone; an ask running for a
     * **press** is never superseded, because `render()` runs immediately after a press to draw the
     * busy button and would otherwise steal the runner from the pair it just started — leaving the
     * button inert with nothing coming. An open ask *may* supersede another open ask, which is
     * what makes switching cases mid-measure work.
     */
    if (ask === key || ask?.endsWith(':press') === true) return;
    ask = key;
    runFailure = undefined;
    const plan = fixitRunPlanOf(entry, emptyFixitState(), host.resources);
    runner.start({
      runs: [{ config: plan.asBuilt, ...FIXIT_RUN_SWITCHES }],
      onDone: ([asBuilt]) => {
        ask = undefined;
        if (asBuilt !== undefined) sessionOf(entry).asBuilt = asBuilt;
        render();
      },
      onFailed: (message) => {
        ask = undefined;
        runFailure = message;
        render();
      },
    });
  }

  function main(entry: FixitCase): HTMLElement {
    const session = sessionOf(entry);
    if (session.asBuilt === undefined) measureAsBuilt(entry);
    const spend = spendOf(entry, session.state);
    const figures =
      session.asBuilt === undefined ? undefined : figureValuesOf(entry, session.asBuilt);
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
          figures === undefined
            ? [
                /*
                 * The figures are measurements of a run that is happening on a worker, so the card
                 * says so rather than drawing four blanks. Mount-status text, on the same footing
                 * as the load-failure line above — this panel's own literal, and this panel is
                 * DOM-bound and outside the honesty search's driven corpus for that reason.
                 */
                el(doc, 'p', {
                  className: 'fixit-measuring',
                  text: 'Measuring the building as it stands…',
                  style: { color: MUTED, margin: '0' },
                }),
              ]
            : figures.map((figure) =>
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
    const busy = ask === `${entry.id}:press`;
    const button = el(doc, 'button', {
      // Named for the same reason `.fixit-repair` is: the tier selects a control by its class and
      // never by the prose a player reads, which is a lesson this file's sibling paid for once.
      className: 'fixit-run',
      text: busy ? 'Running the day…' : session.outcome === undefined ? 'Run the day' : 'Run it again',
      style: { ...buttonStyle(true), 'font-weight': '600', margin: '0.75rem 0' },
    });
    /*
     * **The busy state survives the re-render, which the disabled flag alone did not.**
     * `render()` rebuilds this button, so a press that wrote `disabled`/`textContent` onto the old
     * node lost both the moment anything redrew. That was invisible while the runs blocked the
     * thread — nothing *could* redraw — and is exactly the bug an asynchronous run introduces. So
     * the label and the flag are drawn from {@link ask}, which outlives any one node.
     */
    button.disabled = busy;
    button.addEventListener('click', () => {
      if (busy) return;
      ask = `${entry.id}:press`;
      runFailure = undefined;
      const plan = fixitRunPlanOf(entry, session.state, host.resources);
      // The spend is bound here rather than read in the callback: the outcome is classified
      // against the state the press was made in, not against one the player edited meanwhile.
      const spend = spendOf(entry, session.state);
      runner.start({
        runs: [
          { config: plan.asBuilt, ...FIXIT_RUN_SWITCHES },
          { config: plan.asRepaired, ...FIXIT_RUN_SWITCHES },
        ],
        onDone: ([before, after]) => {
          ask = undefined;
          if (before === undefined || after === undefined) return;
          session.asBuilt = before;
          const outcome = classifyOutcome(entry, measuredOf(entry, before, after), spend);
          session.outcome = outcome;
          // The badge follows the latest run, in both directions — `fixit/engine.ts#fixedBadgeAfter`
          // holds the argument (docs/20 defect 16: FIXED beside a 0 % outcome card is two verdicts
          // about one case on one screen).
          session.fixed = fixedBadgeAfter(outcome);
          render();
        },
        onFailed: (message) => {
          ask = undefined;
          runFailure = message;
          render();
        },
      });
      render();
    });
    return el(doc, 'div', {
      children: [
        button,
        ...(runFailure === undefined
          ? []
          : [
              el(doc, 'p', {
                className: 'fixit-run-failed',
                text: `The day could not be run: ${runFailure}`,
                style: { color: BAD, margin: '0 0 0.5rem' },
              }),
            ]),
      ],
    });
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
