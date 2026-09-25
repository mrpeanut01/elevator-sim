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
 *
 * ## Neither of this mode's runs is **played** here, and that is deliberate rather than pending
 *
 * The Everyday screen plays both: the as-built run before its four figures (GitHub issue #348) and,
 * since [§ D644](../../../../DECISIONS.md), the pair a press produces, side by side at one playhead.
 * This panel plays neither, and the divergence is a ruling rather than an oversight — #348 put the
 * opening sight on the player's screen only and this panel has run without one ever since, on the
 * ground that the two surfaces are **allowed** to differ in presentation and must not differ in
 * what the machinery decides: the same `classifyOutcome`, the same judge (§ D1020), the same
 * `fixedBadgeAfter`, the same figures. `docs/38` § 1's *the fun is watching the people* is a claim
 * about the game, and this overlay is the Engineer's instrument for the same cases — the surface a
 * reader opens to get the sheet, beside the bench and the matrix, not the one a stranger meets.
 *
 * **So `after` is still dropped in the press handler below, and it is dropped knowingly.** If that
 * stops being the right answer, the fix is not a second player of its own: it is
 * `everyday/caseStage.ts` mounted here with this shell's tokens, because § D359's `surfaces-disagree`
 * property exists for exactly the case where two surfaces over one machinery drift apart, and two
 * painters would be the drift rather than the cure.
 */

import { el, fill } from './dom.js';
import type { BrowserResources } from './data.js';
import {
  editorPricingFrom,
  affordabilityOf,
  budgetNoteOf,
  classifyOutcome,
  emptyFixitState,
  fixedBadgeAfter,
  parkingPriceUnits,
  setParkingStrategy,
  spendOf,
  stepCapacity,
  stepSpeed,
  stepTopFloorRaise,
  stepZoneOverlap,
  topFloorRaisePriceUnits,
  zonePriceUnits,
  sameOrder,
  verdictIsStale,
  witnessStateOf,
  type FixitOutcome,
} from '../fixit/engine.js';
import { sameLegs } from '../record/crowd.js';
import {
  FIXIT_RUN_SWITCHES,
  assertPairMatchesRepairs,
  figureValuesOf,
  fixitPlanRefusalOf,
  fixitRunPlanOf,
  measuredOf,
  morningReadingOf,
  standingParkingOf,
  topFloorRaiseCeilingOf,
  zoneOverlapCeilingOf,
} from '../fixit/run.js';
import { DEFAULT_DOOR_TARGET, mountFixitFamilies } from '../everyday/fixitFamilies.js';
import { FIXIT_SCREEN_COPY, fixitParkingRow, fixitVerdictContextOf } from '../everyday/fixitScreenModel.js';
import { editorInputsOf, withPrunedDials } from '../fixit/editorInputs.js';
import type { EditorParkingStrategy, FixitCase, FixitCases, FixitState } from '../fixit/types.js';
import type { PriceSchedule } from '../pricing/types.js';
import type { VizRecording } from '../contract/types.js';

import { createOffThreadRunner } from './offThreadRuns.js';
import { createFixitJudge, pressThroughTheJudge } from '../fixit/judge.js';
import { heldReasonOf, isOffered } from '../fixit/held.js';
import { createOffThreadMornings, morningWorkerCountOf, type MorningWorkerLike } from './offThreadMornings.js';
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
  /**
   * Start one of the judge's morning workers — `dev/morningWorker.ts`, [§ D1020](../../../../DECISIONS.md).
   * Injected for {@link spawnRunWorker}'s reason.
   */
  readonly spawnMorningWorker: () => MorningWorkerLike;
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
  /** Which door-hold target the door selects edit — view state, § D1000. */
  doorTarget: string;
  /** The order {@link CaseSession.outcome} was measured on — § D1011; see the Everyday screen's twin. */
  verdictState: FixitState | undefined;
  /** The diagnosed repair's own run on the case seed, asked for only after a fixed verdict — § D1011. */
  witness: VizRecording | undefined;
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

/**
 * The price schedule these cases were loaded with — GitHub issue **#366**.
 *
 * Read off {@link cases} rather than fetched again, so this panel and the parser that priced its
 * repairs cannot disagree about what anything costs. Throws rather than defaulting: a panel drawing
 * prices before its data arrived would draw zeroes, and a free repair is a worse lie than a crash.
 */
function scheduleNow(): PriceSchedule {
  const schedule = cases?.schedule;
  if (schedule === undefined) {
    throw new Error('the fix-a-building panel asked for a price before its cases had loaded.');
  }
  return schedule;
}
  let loadFailure: string | undefined;
  let selectedId: string | undefined;
  const sessions = new Map<string, CaseSession>();

  const runner = createOffThreadRunner({ spawn: host.spawnRunWorker });
  /** The judge's mornings — § D1020. A second pool, for `everyday/fixitScreen.ts`'s reason. */
  const judge = createFixitJudge(
    createOffThreadMornings({
      spawn: host.spawnMorningWorker,
      workers: morningWorkerCountOf(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency),
    }),
  );

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
  /** The letter's morning cleared and the other mornings are running — § D1020. */
  let checking = false;

  const sessionOf = (entry: FixitCase): CaseSession => {
    let session = sessions.get(entry.id);
    if (session === undefined) {
      session = {
        state: emptyFixitState(),
        fixed: false,
        outcome: undefined,
        asBuilt: undefined,
        doorTarget: DEFAULT_DOOR_TARGET,
        verdictState: undefined,
        witness: undefined,
      };
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
          selectedId = loaded.cases.find((entry) => isOffered(entry.id))?.id;
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
    const entry =
      cases.cases.find((candidate) => candidate.id === selectedId && isOffered(candidate.id)) ??
      cases.cases.find((candidate) => isOffered(candidate.id));
    if (entry === undefined) {
      fill(root, el(doc, 'p', { text: 'The case file holds no cases.', style: { padding: '2rem' } }), closeButton());
      return;
    }
    const fixedCount = cases.cases.filter(
      (candidate) => isOffered(candidate.id) && sessions.get(candidate.id)?.fixed === true,
    ).length;
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
          /* Out of the cases offered — a held case is not one the player can fix (§ D1020). */
          text: `${String(fixedCount)}/${String(loaded.cases.filter((entry) => isOffered(entry.id)).length)} fixed`,
          style: { color: MUTED, margin: '0 0 0.75rem' },
        }),
        ...loaded.cases.map((entry) => {
          const session = sessions.get(entry.id);
          const held = heldReasonOf(entry.id);
          const tag = held !== undefined ? FIXIT_SCREEN_COPY.heldTag : session?.fixed === true ? 'FIXED' : 'OPEN';
          const row = el(doc, 'button', {
            className: held === undefined ? 'fixit-case' : 'fixit-case fixit-case-held',
            style: {
              ...buttonStyle(entry.id === current.id),
              display: 'block',
              width: '100%',
              'text-align': 'left',
              'margin-bottom': '0.5rem',
              ...(held === undefined ? {} : { opacity: '0.7', cursor: 'not-allowed' }),
            },
            children: [
              el(doc, 'div', { text: entry.name }),
              el(doc, 'div', {
                text: `${buildingNameOf(entry)} · ${tag}`,
                style: { color: MUTED, 'font-size': '12px' },
              }),
              /* A held case is drawn with its reason and cannot be opened — § D1020. */
              ...(held === undefined
                ? []
                : [el(doc, 'div', { className: 'fixit-held-reason', text: held, style: { color: MUTED, 'font-size': '12px' } })]),
            ],
          });
          row.disabled = held !== undefined;
          row.addEventListener('click', () => {
            if (held !== undefined) return;
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
    /* The judge's forty-nine as-built mornings, off-thread while the figures are drawn — § D1020. */
    judge.prepare(entry, plan.asBuilt);
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
    const spend = spendOf(entry, session.state, scheduleNow());
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
          // § D478's derived declaration, where the Everyday screen draws it too.
          ...(entry.demandDisclosure === undefined
            ? []
            : [el(doc, 'p', { text: entry.demandDisclosure, style: { color: MUTED, margin: '0.5rem 0 0' } })]),
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
        /*
         * The repair menu and the standing extras stood here as toggles. They retired on
         * [§ D1020](../../../../DECISIONS.md)'s commit, with the Everyday screen's, under § D706
         * clause 6 — the editor below writes every answer, and a verdict now means fifty mornings.
         */
        el(doc, 'h2', { text: 'Machinery, priced against the same budget', style: h2Style() }),
        stepperRow(entry, session, 'speed'),
        stepperRow(entry, session, 'capacity'),
        zoneRow(entry, session),
        elevationRow(entry, session),
        /* § D1000's five families — the same mount the Everyday screen draws, in this theme. */
        mountFixitFamilies({
          doc,
          entry,
          state: session.state,
          resources: host.resources,
          schedule: scheduleNow(),
          running: ask === `${entry.id}:press`,
          doorTarget: session.doorTarget,
          setDoorTarget: (target) => {
            session.doorTarget = target;
            render();
          },
          commit: (next) => {
            session.state = next;
            render();
          },
          palette: {
            ink: INK,
            soft: MUTED,
            faint: MUTED,
            rule: 'var(--edge)',
            paper: CARD_BG,
            label: MUTED,
            alarm: BAD,
            accent: GOOD,
            radius: 6,
            mono: 'ui-monospace, monospace',
          },
          prefix: 'fixit',
          /* The parking select beside the floor it summons — § D1020, as on the Everyday screen. */
          parkingRow: parkingRow(entry, session),
        }),
        el(doc, 'p', {
          text: `${String(spend.totalUnits)} of ${String(entry.budgetUnits)} u committed, ${String(spend.machineryUnits)} u of it machinery — ${budgetNoteOf(entry, spend)}`,
          style: { color: MUTED },
        }),
        runButton(entry, session),
        /* Stale over the card rather than instead of it — § D1011, the Everyday screen's rule. */
        ...(session.outcome !== undefined && verdictIsStale(session.verdictState, session.state)
          ? [
              el(doc, 'p', {
                className: 'fixit-verdict-stale',
                text: FIXIT_SCREEN_COPY.verdictStale,
                style: { color: BAD, margin: '0.5rem 0' },
              }),
            ]
          : []),
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

  function stepperRow(entry: FixitCase, session: CaseSession, which: 'speed' | 'capacity'): HTMLElement {
    const steps = which === 'speed' ? session.state.speedSteps : session.state.capacitySteps;
    const pricing = editorPricingFrom(scheduleNow());
    const price = which === 'speed' ? pricing.speedUnitsPerHalfMps : pricing.capacityUnitsPerTwoPlaces;
    const canBuy = affordabilityOf(entry, session.state, price, scheduleNow()).selectable;
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
      session.state = which === 'speed' ? stepSpeed(entry, session.state, -1, scheduleNow()) : stepCapacity(entry, session.state, -1, scheduleNow());
      render();
    });
    plus.addEventListener('click', () => {
      session.state = which === 'speed' ? stepSpeed(entry, session.state, 1, scheduleNow()) : stepCapacity(entry, session.state, 1, scheduleNow());
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

  /**
   * **What this case's fabric allows**, computed once per case rather than per render.
   *
   * Both answers are derived from the as-built `SimulationConfig` — the zoning ceiling from its
   * resolved building, the standing parking rule from its dispatcher profile — so neither is a
   * second opinion this file holds about a run. Memoised because building that config parses and
   * resolves the whole tower, and `render()` runs on every press.
   */
  const fabricByCase = new Map<
    string,
    { readonly ceiling: number; readonly standing: string; readonly elevationCeiling: number }
  >();
  function editorFabricOf(
    entry: FixitCase,
  ): { readonly ceiling: number; readonly standing: string; readonly elevationCeiling: number } {
    const cached = fabricByCase.get(entry.id);
    if (cached !== undefined) return cached;
    const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), host.resources).asBuilt;
    const fabric = {
      ceiling: zoneOverlapCeilingOf(asBuilt.building),
      standing: standingParkingOf(asBuilt),
      elevationCeiling: topFloorRaiseCeilingOf(asBuilt.building),
    };
    fabricByCase.set(entry.id, fabric);
    return fabric;
  }

  /**
   * § 10.3's zones and service ranges — GitHub issue **#422**.
   *
   * `null` on a building whose banks cannot overlap, which is every single-bank tower: eight of the
   * eighteen shipped cases draw no row here at all, because a stepper that writes a field and moves
   * no leg is § D219's defect and a dev surface is not exempt from it.
   *
   * **The `+` refusal is one of two sentences and never one of one.** At the building's ceiling with
   * budget still in hand, *at the budget* would be false — and a reader chasing the wrong refusal is
   * the whole reason `docs/20` defect 8 exists.
   */
  function zoneRow(entry: FixitCase, session: CaseSession): HTMLElement | null {
    const { ceiling } = editorFabricOf(entry);
    if (ceiling <= 0) return null;
    const floors = session.state.zoneOverlapFloors;
    const price = zonePriceUnits(scheduleNow());
    const canBuy = affordabilityOf(entry, session.state, price, scheduleNow()).selectable;
    const atCeiling = floors >= ceiling;
    const atBudget = floors === 0 && !canBuy;
    const minus = el(doc, 'button', { text: '−', style: buttonStyle(false) });
    const plus = el(doc, 'button', { text: '+', style: buttonStyle(false) });
    minus.disabled = floors === 0;
    plus.disabled = atCeiling || atBudget;
    if (atCeiling) plus.title = 'the banks already reach as far into each other as this building lets them';
    else if (atBudget) plus.title = 'at the budget';
    minus.addEventListener('click', () => {
      session.state = stepZoneOverlap(entry, session.state, -1, ceiling, scheduleNow());
      render();
    });
    plus.addEventListener('click', () => {
      session.state = stepZoneOverlap(entry, session.state, 1, ceiling, scheduleNow());
      render();
    });
    const suffix = atCeiling ? ' — as far as this building goes' : atBudget ? ' — at the budget' : '';
    return el(doc, 'div', {
      style: { display: 'flex', 'align-items': 'center', gap: '0.5rem', 'margin-bottom': '0.5rem' },
      children: [
        minus,
        plus,
        el(doc, 'span', {
          text:
            `Bank overlap · ${String(price)} u once, whatever it moves · ` +
            `${floors === 0 ? 'the boundaries as drawn' : `+${String(floors)} ${floors === 1 ? 'floor' : 'floors'} each side`}${suffix}`,
          style: { color: MUTED },
        }),
      ],
    });
  }

  /**
   * § 10.3's parking — GitHub issue **#422**. Free (`idle-parking` is 0 u), and free is not inert:
   * every option below writes `dispatcher.idle.parkingStrategy` and moves the legs.
   *
   * **The strategy the case already runs is left out**, which is what `standing` is for — offering
   * it would be a press that writes the value the run already carries. The first option is the
   * absence rather than a fourth strategy.
   */
  function parkingRow(entry: FixitCase, session: CaseSession): HTMLElement {
    const { standing } = editorFabricOf(entry);
    const price = parkingPriceUnits(scheduleNow());
    const select = el(doc, 'select', { style: { padding: '0.2rem' } }) as HTMLSelectElement;
    select.setAttribute('aria-label', 'Where idle cars wait');
    /*
     * The options and their words are `fixitScreenModel.ts#fixitParkingRow`'s — the Everyday
     * screen's own — since § D1000 took the list to all five strategies: a second hand-written
     * ternary here would have named `predicted-demand` *in the middle of its own zone*.
     */
    for (const choice of fixitParkingRow(session.state, standing, price).options) {
      const option = doc.createElement('option');
      option.value = choice.value ?? '';
      option.textContent = choice.label;
      option.selected = choice.selected;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const picked = select.value === '' ? null : (select.value as EditorParkingStrategy);
      session.state = withPrunedDials(
        entry,
        setParkingStrategy(entry, session.state, picked, scheduleNow()),
        host.resources,
      );
      render();
    });
    return el(doc, 'div', {
      style: { display: 'flex', 'align-items': 'center', gap: '0.5rem', 'margin-bottom': '0.5rem' },
      children: [
        select,
        el(doc, 'span', {
          text:
            price === 0
              ? 'Where idle cars wait · no charge — telling a controller where to send an empty car costs nothing'
              : `Where idle cars wait · ${String(price)} u`,
          style: { color: MUTED },
        }),
      ],
    });
  }

  /**
   * § 10.3's elevation control — GitHub issue **#422**. `zoneRow`'s own shape, pointed at the
   * building's topmost floor: `null` where `topFloorRaiseCeilingOf` reports `0` (served by no bank,
   * or one half of a double-deck pair), so a stepper that would write a field and move no leg is
   * never drawn — a dev surface is not exempt from that either.
   */
  function elevationRow(entry: FixitCase, session: CaseSession): HTMLElement | null {
    const { elevationCeiling: ceiling } = editorFabricOf(entry);
    if (ceiling <= 0) return null;
    const metres = session.state.topFloorRaiseM;
    const price = topFloorRaisePriceUnits(scheduleNow());
    const canBuy = affordabilityOf(entry, session.state, price, scheduleNow()).selectable;
    const atCeiling = metres >= ceiling;
    const atBudget = metres === 0 && !canBuy;
    const minus = el(doc, 'button', { text: '−', style: buttonStyle(false) });
    const plus = el(doc, 'button', { text: '+', style: buttonStyle(false) });
    minus.disabled = metres === 0;
    plus.disabled = atCeiling || atBudget;
    if (atCeiling) plus.title = 'this is as far as a repair budget moves a floor';
    else if (atBudget) plus.title = 'at the budget';
    minus.addEventListener('click', () => {
      session.state = stepTopFloorRaise(entry, session.state, -1, ceiling, scheduleNow());
      render();
    });
    plus.addEventListener('click', () => {
      session.state = stepTopFloorRaise(entry, session.state, 1, ceiling, scheduleNow());
      render();
    });
    const suffix = atCeiling ? ' — as far as a repair budget goes' : atBudget ? ' — at the budget' : '';
    return el(doc, 'div', {
      style: { display: 'flex', 'align-items': 'center', gap: '0.5rem', 'margin-bottom': '0.5rem' },
      children: [
        minus,
        plus,
        el(doc, 'span', {
          text:
            `Top floor · ${String(price)} u once, however far it moves · ` +
            `${metres === 0 ? 'as the building draws it' : `+${String(metres)} ${metres === 1 ? 'metre' : 'metres'}`}${suffix}`,
          style: { color: MUTED },
        }),
      ],
    });
  }

  function runButton(entry: FixitCase, session: CaseSession): HTMLElement {
    const busy = ask === `${entry.id}:press`;
    const button = el(doc, 'button', {
      // Named for the same reason `.fixit-repair` is: the tier selects a control by its class and
      // never by the prose a player reads, which is a lesson this file's sibling paid for once.
      className: 'fixit-run',
      text: busy
        ? checking
          ? FIXIT_SCREEN_COPY.checkingLabel
          : 'Running the day…'
        : session.outcome === undefined
          ? 'Run the day'
          : 'Run it again',
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
      /* An order the loader would refuse is said, never thrown from a click — § D1000. */
      if (fixitPlanRefusalOf(entry, session.state, host.resources) !== undefined) {
        runFailure = FIXIT_SCREEN_COPY.planRefused;
        render();
        return;
      }
      ask = `${entry.id}:press`;
      runFailure = undefined;
      // The order and the spend are bound here rather than read in the callback: the outcome is
      // classified against the order the press was made in, not against one the player edited
      // meanwhile — and an edit made meanwhile is drawn as stale the moment the verdict lands.
      const pressed = session.state;
      const schedule = scheduleNow();
      const plan = fixitRunPlanOf(entry, pressed, host.resources);
      const spend = spendOf(entry, pressed, schedule);
      /*
       * Through the judge — [§ D1020](../../../../DECISIONS.md), exactly as the Everyday screen: one
       * pair and today's bars as the gate, then forty-nine more mornings only when it clears, and
       * only the fifty-morning verdict may badge the case. `ask` stays on the press through the
       * checking, so the button holds under a verdict about to land on the order it shows.
       */
      pressThroughTheJudge({
        entry,
        plan,
        switches: FIXIT_RUN_SWITCHES,
        pairRunner: runner,
        judge,
        readingOf: morningReadingOf,
        classify: (before, after, done) => {
          // GitHub issue #350: the claim the basis line will make, checked on the legs first.
          assertPairMatchesRepairs(entry, pressed, before, after);
          const measurement = measuredOf(entry, before, after);
          const answer = (witnessRun: boolean): void => {
            done(
              classifyOutcome(
                entry,
                measurement,
                spend,
                fixitVerdictContextOf({
                  entry,
                  state: pressed,
                  inputs: editorInputsOf(entry, pressed, host.resources, schedule),
                  schedule,
                  witnessRun,
                }),
              ),
            );
          };
          /*
           * The authored result only over the diagnosed repair's own run, leg for leg, and that run
           * asked for only after both bars have cleared — § D1011, the Everyday screen's rule and its
           * reasons, which are not restated here. It is taken inside the judge's `classify`
           * continuation, before the mornings, as on that screen.
           */
          if (classifyOutcome(entry, measurement, spend).kind !== 'fixed') {
            answer(false);
            return;
          }
          if (sameOrder(pressed, witnessStateOf(entry))) session.witness ??= after;
          const cached = session.witness;
          if (cached !== undefined) {
            answer(sameLegs(after, cached));
            return;
          }
          runner.start({
            runs: [
              { config: fixitRunPlanOf(entry, witnessStateOf(entry), host.resources).asRepaired, ...FIXIT_RUN_SWITCHES },
            ],
            onDone: ([witness]) => {
              if (witness === undefined) {
                answer(false);
                return;
              }
              session.witness = witness;
              answer(sameLegs(after, witness));
            },
            onFailed: () => {
              answer(false);
            },
          });
        },
        onGate: (outcome, before) => {
          session.asBuilt = before;
          session.outcome = outcome;
          session.verdictState = pressed;
          checking = outcome.kind === 'checking';
          if (!checking) ask = undefined;
          // The badge follows the latest verdict, in both directions — `fixit/engine.ts#fixedBadgeAfter`
          // holds the argument (docs/20 defect 16: FIXED beside a 0 % outcome card is two verdicts
          // about one case on one screen). `checking` wears none.
          session.fixed = fixedBadgeAfter(outcome);
          render();
        },
        onVerdict: (outcome) => {
          ask = undefined;
          checking = false;
          session.outcome = outcome;
          session.verdictState = pressed;
          session.fixed = fixedBadgeAfter(outcome);
          render();
        },
        onFailed: (message) => {
          ask = undefined;
          checking = false;
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
      /*
       * The outcome's own basis — [§ D1020](../../../../DECISIONS.md). This drew `BASIS_LINE`
       * whatever the outcome said, so a crowd-changing pair and, now, a fifty-morning verdict would
       * both have been captioned *one run before, one run after*.
       */
      el(doc, 'p', { text: outcome.basis, style: { color: MUTED, 'font-size': '12px', margin: '0.5rem 0 0' } }),
    ]);
    // The card the tier waits on. `card()` is shared by six blocks on this screen, so the name goes
    // on the instance rather than into the helper.
    box.className = 'fixit-outcome';
    return box;
  }

  return { open, close, root };
}
