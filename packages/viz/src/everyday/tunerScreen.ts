/**
 * **Tune the tower** — GAMEPLAY § 3.3's tuner row over § 18's `tune{…}`, the DOM half.
 *
 * Every word, every ladder and every seam claim is `tunerModel.ts`'s, which is where the seven
 * controls are mapped to the fields they write and where the three refused prototype controls are
 * argued. This file draws that and makes the presses.
 *
 * ## It is reached from the brief and the report, not from the rail
 *
 * § 3.2: *Tune the tower is not a rail item… It is a thing you do to a day, not a place you live.*
 * So this module registers a screen and adds no rail row; the two doors into it (*Take it to the
 * sandbox* on the brief, the report's third lever) arrive with those screens.
 *
 * ## The primary is one apply of everything, then the run
 *
 * Four of the seven live on the building and two on the demand, so *Run it and watch* writes both
 * documents and then runs: `applyBuildingSpec` (which stands the week on the sandbox contract) and
 * `applyPatternSpec` (which saves the pattern **and points the selection at it**, because a pattern
 * the run cannot be pointed at is the dead seam this repository keeps finding). Door dwell is the
 * seventh and is written as it is pressed, because `GroupLevers` is state the Engineer surface also
 * shows and a deferred write there would leave two panels disagreeing.
 */

import type { BuildingSpec } from '../authoring/buildingSpec.js';
import { actionBarFor } from './actionBar.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import { classOfSpec, designerClasses } from './designerModel.js';
import {
  buildingWithTune,
  movedKeys,
  patternWithTune,
  snapToStep,
  tuneCapacityReadout,
  tuneDwellChips,
  tuneMachineSteps,
  tuneReadout,
  tuneSandboxStrip,
  tuneSpeedReadout,
  tuneStateFrom,
  tunerBarModel,
  TUNE_CARDS,
  TUNER_COPY as COPY,
  type TuneKey,
  type TuneState,
} from './tunerModel.js';

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Which keys the mounted screen has moved, for the `bar()` refinement.
 *
 * Module-level rather than on the mount, because `screens.ts`'s `bar()` is called by the shell with
 * a state and no handle — the same seam `fixitScreen.ts` uses its module store for, and the same
 * argument: the § 3.3 note is a fact about the screen's session, and the shell has to be able to
 * ask for it without holding the mount.
 */
let movedNow: readonly TuneKey[] = [];

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  const dataHost = context.host;
  const specs = dataHost.elevatorSpecs();
  const classes = designerClasses(specs);

  const building = dataHost.buildingSpec();
  const pattern = dataHost.patternSpec();

  const root = el(doc, 'div', 'everyday-tuner');
  root.style.cssText = 'display:grid;gap:16px;max-width:1040px';

  const header = el(doc, 'div');
  header.style.cssText = 'display:flex;align-items:baseline;gap:14px;flex-wrap:wrap';
  const title = el(doc, 'h1', undefined, COPY.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0`;
  const lede = el(doc, 'span', undefined, COPY.lede);
  lede.style.cssText = `font-size:13px;color:${C.warmGrey};min-width:0;flex:1 1 340px`;
  header.append(title, lede);
  root.append(header);

  /*
   * A standing building this build does not know leaves nothing to tune — four of the seven
   * controls write onto its spec. Refused in a sentence rather than drawn as sliders that write
   * into a document that does not exist: `buildingById`'s honest-lookup rule, at the screen.
   */
  if (building === undefined) {
    const refusal = el(doc, 'p', 'everyday-tuner-refusal', COPY.noBuilding);
    refusal.style.cssText = `font-size:14px;color:${C.alarm};line-height:1.55;max-width:70ch`;
    root.append(refusal);
    host.append(root);
    movedNow = [];
    return {};
  }
  /* Bound after the guard, so every closure below reads a spec rather than a maybe-spec. */
  const standingBuilding: BuildingSpec = building;

  const standing: TuneState = tuneStateFrom(standingBuilding, pattern, dataHost.doorDwell());
  let tune: TuneState = standing;
  movedNow = [];

  /* ---- the sandbox strip ---- */
  const strip = el(doc, 'div', 'everyday-tuner-strip');
  strip.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid ${C.amberEdge};border-radius:${String(R.tile)}px;background:${C.amberWash};flex-wrap:wrap`;
  const stripState = el(doc, 'span', 'everyday-tuner-state');
  stripState.style.cssText = 'font-size:13.5px;font-weight:600;flex:none';
  const stripNote = el(doc, 'span', 'everyday-tuner-note');
  stripNote.style.cssText = `font-size:13px;color:${C.inkSoft};min-width:0;flex:1 1 320px;line-height:1.5`;
  strip.append(stripState, stripNote);
  root.append(strip);

  /* ---- the cards ---- */
  const cards = el(doc, 'div');
  cards.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;align-items:start';
  root.append(cards);

  /* ---- the stamp ---- */
  const stamp = el(doc, 'div', 'everyday-tuner-stamp');
  stamp.style.cssText = `padding:15px 18px;border:1px solid ${C.rule};border-radius:${String(R.tile)}px;background:${C.cardSunkDeep}`;
  const stampHead = el(doc, 'div', 'everyday-tuner-stamp-head');
  stampHead.style.cssText = `font-family:${TYPE.heading};font-size:17px;font-weight:600`;
  const stampBody = el(doc, 'div', 'everyday-tuner-stamp-body');
  stampBody.style.cssText = `font-size:13px;color:${C.inkSoft};line-height:1.5;margin-top:3px;max-width:80ch`;
  stamp.append(stampHead, stampBody);
  root.append(stamp);

  function set(patch: Partial<TuneState>): void {
    tune = { ...tune, ...patch };
    movedNow = movedKeys(standing, tune);
    redraw();
    context.refreshBar();
  }

  function drawSliderRow(
    parent: HTMLElement,
    row: (typeof TUNE_CARDS)[number]['rows'][number],
  ): void {
    const block = el(doc, 'div', 'everyday-tuner-row');
    block.style.cssText = 'display:grid;gap:4px';
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px';
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = 'font-size:14px;font-weight:600';
    const hint = el(doc, 'span', undefined, row.hint);
    hint.style.cssText = `font-size:12px;color:${C.warmGrey};min-width:0`;
    const readout = el(doc, 'span', 'everyday-tuner-readout', tuneReadout(row, tune));
    readout.style.cssText = `margin-left:auto;font:500 13px ${TYPE.mono};color:${C.terracotta};flex:none`;
    head.append(label, hint, readout);
    const input = el(doc, 'input');
    input.type = 'range';
    input.min = String(row.min);
    input.max = String(row.max);
    input.step = String(row.step);
    input.value = String(tune[row.key]);
    input.style.cssText = 'width:100%;margin-top:5px';
    input.addEventListener('input', () => {
      set({ [row.key]: Number(input.value) } as Partial<TuneState>);
    });
    const writes = el(doc, 'div', 'everyday-tuner-writes', row.writes);
    writes.style.cssText = `font:500 10px ${TYPE.mono};color:${C.faint}`;
    block.append(head, input, writes);
    parent.append(block);
  }

  /** § 10.1's ladders, drawn as chips — a control whose resolution is its own. */
  function drawStepRow(
    parent: HTMLElement,
    label: string,
    steps: readonly number[],
    value: number,
    readout: string,
    format: (step: number) => string,
    writes: string,
    onPick: (next: number) => void,
  ): void {
    const block = el(doc, 'div');
    block.style.cssText = 'display:grid;gap:5px';
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px';
    const name = el(doc, 'span', undefined, label);
    name.style.cssText = 'font-size:14px;font-weight:600';
    const value_ = el(doc, 'span', 'everyday-tuner-readout', readout);
    value_.style.cssText = `margin-left:auto;font:500 13px ${TYPE.mono};color:${C.terracotta};flex:none`;
    head.append(name, value_);
    const chips = el(doc, 'div', 'everyday-tuner-steps');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px';
    for (const step of steps) {
      const selected = step === value;
      const chip = el(doc, 'button', 'everyday-tuner-step', format(step));
      chip.type = 'button';
      chip.style.cssText = `cursor:pointer;border:1.5px solid ${selected ? C.sun : C.rule};background:${selected ? C.sun : C.paper};color:${C.ink};border-radius:${String(R.pill)}px;padding:5px 11px;font:500 11.5px ${TYPE.mono}`;
      chip.addEventListener('click', () => {
        onPick(step);
      });
      chips.append(chip);
    }
    const writesNode = el(doc, 'div', 'everyday-tuner-writes', writes);
    writesNode.style.cssText = `font:500 10px ${TYPE.mono};color:${C.faint}`;
    block.append(head, chips, writesNode);
    parent.append(block);
  }

  function drawDwell(parent: HTMLElement): void {
    const block = el(doc, 'div');
    block.style.cssText = 'display:grid;gap:5px';
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px';
    const name = el(doc, 'span', undefined, COPY.dwellLabel);
    name.style.cssText = 'font-size:14px;font-weight:600';
    const hint = el(doc, 'span', undefined, COPY.dwellHint);
    hint.style.cssText = `font-size:12px;color:${C.warmGrey};min-width:0`;
    head.append(name, hint);
    const chips = el(doc, 'div', 'everyday-tuner-dwell');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px';
    for (const chip of tuneDwellChips(tune.dwell)) {
      const button = el(doc, 'button', 'everyday-tuner-dwell-chip');
      button.type = 'button';
      button.style.cssText = `cursor:pointer;border:1.5px solid ${chip.selected ? C.sun : C.rule};background:${chip.selected ? C.sun : C.paper};color:${C.ink};border-radius:${String(R.control)}px;padding:5px 10px;text-align:left`;
      const label = el(doc, 'div', undefined, chip.label);
      label.style.cssText = 'font-size:12px;font-weight:600';
      const seconds = el(doc, 'div', undefined, chip.seconds);
      seconds.style.cssText = `font:500 10px ${TYPE.mono};color:${C.warmGrey}`;
      button.append(label, seconds);
      button.addEventListener('click', () => {
        /*
         * Written through immediately — see the module docstring. `set` then re-reads nothing: the
         * lever is the host's, and the screen's own copy moves with it so the chip lights.
         */
        dataHost.setDoorDwell(chip.choice);
        set({ dwell: chip.choice });
      });
      chips.append(button);
    }
    const writes = el(
      doc,
      'div',
      'everyday-tuner-writes',
      'every car’s dwellCarCallS / dwellHallCallS',
    );
    writes.style.cssText = `font:500 10px ${TYPE.mono};color:${C.faint}`;
    block.append(head, chips, writes);
    parent.append(block);
  }

  function redraw(): void {
    const strip_ = tuneSandboxStrip(movedNow);
    stripState.textContent = strip_.state;
    stripNote.textContent = strip_.note;
    stampHead.textContent = movedNow.length > 0 ? COPY.stampMoved : COPY.stampClean;
    stampBody.textContent = movedNow.length > 0 ? COPY.stampMovedBody : COPY.stampCleanBody;

    const drawn = buildingWithTune(standingBuilding, tune);
    const machineClass = classOfSpec(classes, drawn);
    const steps = tuneMachineSteps(machineClass, tune);
    /*
     * A design whose class does not carry the set speed or load is snapped back onto the ladder
     * **before** the chips are drawn, not after — a card drawn from one value and lit from another
     * is a control whose selected state is a lie. Only ever downward, `snapToStep`'s own rule, and
     * only reachable through a class change, which this screen does not offer today: it is here
     * because `applyBuildingSpec` would otherwise hand `parseBuilding` a car outside its band.
     */
    const snappedSpeed = snapToStep(steps.speeds, tune.speed);
    const snappedCap = snapToStep(steps.loads, tune.cap);
    if (snappedSpeed !== tune.speed || snappedCap !== tune.cap) {
      tune = { ...tune, speed: snappedSpeed, cap: snappedCap };
      movedNow = movedKeys(standing, tune);
    }

    cards.replaceChildren();
    for (const card of TUNE_CARDS) {
      const node = el(doc, 'div', 'everyday-tuner-card');
      node.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};overflow:hidden;display:flex;flex-direction:column`;
      const head = el(doc, 'div');
      head.style.cssText = `padding:13px 16px;border-bottom:1px solid ${C.ruleLight};display:flex;align-items:baseline;gap:10px;flex-wrap:wrap`;
      const name = el(doc, 'span', undefined, card.name);
      name.style.cssText = `font-family:${TYPE.heading};font-size:19px;font-weight:600`;
      const sub = el(doc, 'span', undefined, card.sub);
      sub.style.cssText = `font-size:12.5px;color:${C.warmGrey};min-width:0`;
      head.append(name, sub);
      const body = el(doc, 'div');
      body.style.cssText = 'padding:14px 16px;display:grid;gap:14px';
      for (const row of card.rows) drawSliderRow(body, row);
      if (card.dwellChips) {
        if (machineClass !== undefined) {
          drawStepRow(
            body,
            COPY.speedLabel,
            steps.speeds,
            tune.speed,
            tuneSpeedReadout(tune),
            (step) => `${step.toFixed(2)}`,
            'every car’s ratedSpeedMps',
            (next) => {
              set({ speed: next });
            },
          );
          drawStepRow(
            body,
            COPY.capLabel,
            steps.loads,
            tune.cap,
            tuneCapacityReadout(tune),
            (step) => `${String(step)} lb`,
            'every car’s capacityLb',
            (next) => {
              set({ cap: next });
            },
          );
        }
        drawDwell(body);
        const hint = el(doc, 'p', undefined, COPY.stepsHint);
        hint.style.cssText = `font-size:12px;color:${C.warmGrey};line-height:1.45;margin:0`;
        body.append(hint);
      }
      const effect = el(doc, 'div', undefined, card.effect);
      effect.style.cssText = `margin-top:auto;padding:11px 16px;border-top:1px solid ${C.ruleLight};background:${C.cardSunk};font-size:12.5px;color:${C.inkSoft};line-height:1.45`;
      node.append(head, body, effect);
      cards.append(node);
    }
  }

  redraw();
  host.append(root);

  return {
    /* § 3.3's primary — *Run it and watch*: both documents, then the run, then the stage. */
    primary: () => {
      /*
       * Both documents, then the run, then the stage. The building goes first because
       * `applyBuildingSpec` is the press that moves the week onto the sandbox contract, and a
       * pattern saved against a scored week and then sandboxed would be a saved pattern whose name
       * describes a run the week never had.
       */
      dataHost.applyBuildingSpec(buildingWithTune(standingBuilding, tune));
      dataHost.applyPatternSpec(patternWithTune(pattern, tune));
      dataHost.startRun();
      context.go('stage');
    },
    unmount: () => {
      movedNow = [];
    },
  };
}

/** The registry row — GAMEPLAY § 3.3's tuner screen, mounted by `shell.ts` through `screens.ts`. */
export const TUNER_SCREEN: EverydayScreenModule = {
  key: 'tuner',
  mount,
  /* Start from the table's own row and pick between its two note variants by index. */
  bar: (state) => tunerBarModel(actionBarFor(state), movedNow),
};
