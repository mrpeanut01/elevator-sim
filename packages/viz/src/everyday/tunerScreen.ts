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
 * ## The primary is one sandbox day of everything that moved, then the stage
 *
 * Four of the seven live on the building, two on the demand and one on the levers, and *Run it and
 * watch* hands whichever moved to the host's `runSandbox` in one press (`tunerModel.ts#tunePresses`),
 * which runs them as a sandbox day over the week and puts the week back when the player leaves
 * (`everyday/sandbox.ts`, [§ D1368](../../../../DECISIONS.md)). Door dwell used to be written as it
 * was pressed, so that the Engineer surface's lever panel would agree with the chip; that wrote it
 * into the scored day's levers before any run, and the post-AN panel's seat D found the day running
 * on it. It is held with the other six now, and the Engineer panel shows the lever the day has.
 */

import type { BuildingSpec } from '../authoring/buildingSpec.js';
import { DEFAULT_PATTERN } from '../authoring/patternSpec.js';
import { actionBarFor } from './actionBar.js';
import { everydayProfileStore } from './profileStore.js';
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
  snapToStep,
  tuneCapacityReadout,
  tuneDwellChips,
  tuneMachineSteps,
  tunePresses,
  tuneReadout,
  tuneSandboxStrip,
  tuneSpeedReadout,
  tuneStateFrom,
  tunerBarModel,
  tuneRowsOffered,
  TUNE_CARDS,
  TUNER_COPY as COPY,
  type TuneKey,
  type TuneState,
} from './tunerModel.js';
import { speedValueFigure, type EverydayUnits } from './units.js';

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

/**
 * The mounted screen's host, for the `bar()` refinement's § D1360 question — module-level for
 * {@link movedNow}'s reason, and cleared on unmount so a bar asked for with nothing mounted refuses
 * nothing.
 */
let tunerHost: EverydayScreenShellContext['host'] | undefined;

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  const dataHost = context.host;
  tunerHost = dataHost;
  const specs = dataHost.elevatorSpecs();
  const classes = designerClasses(specs);

  /*
   * **What the day runs, as the day hands it over** — wave AO, [§ D1368](../../../../DECISIONS.md).
   * This read the building as authored and the pattern's profile `typical`, so on Midtown it opened
   * on the tower let in full where the day is let at about a third, and on a rung that declares a
   * rate it opened on a rate the day does not run. `sandboxStanding` is the tower after its
   * contract's rung, the rate the day runs at and the levers' door dwell; whether the day keeps its
   * own mix is the planned day's, read below.
   */
  const standingDay = dataHost.sandboxStanding();
  const building = standingDay?.building;

  /**
   * How this screen's machine specifications read — § 15.1's `Units` row, GitHub issue #170.
   *
   * Read per draw for `designerScreen.ts`'s stated reason: the preference is set on another screen
   * and this shell mounts one at a time. **Presentation only** — every use is inside a string, and
   * the rungs this screen writes are `tuneMachineSteps`' SI ladder either way.
   */
  const unitsNow = (): EverydayUnits => everydayProfileStore().units();

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
   * **While a scored attempt stands, this screen runs nothing** — wave AO, lane AO-1,
   * [§ D1360](../../../../DECISIONS.md). *Run it and watch* would run the attempt's day; the bar
   * draws it inert with this sentence, and it is said here too, above the controls it covers.
   */
  const held = dataHost.attemptHold();
  if (held !== undefined) {
    const line = el(doc, 'p', 'everyday-tuner-held', held);
    line.style.cssText = `font-size:13px;color:${C.ink};line-height:1.5;max-width:70ch;margin:0`;
    root.append(line);
  }

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

  const pattern = standingDay?.pattern ?? DEFAULT_PATTERN;
  /* Whether the day keeps its own mix — the planned day's answer, which the brief's caveat reads too. */
  const mixIsTheDays = dataHost.dayAhead().templateVariesMix;
  const standing: TuneState = tuneStateFrom(standingBuilding, pattern, standingDay?.dwell);
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

  /*
   * ---- the day it copies: kept unless the player leaves it out ---- wave AP lane AP-D2,
   * [§ D1451](../../../../DECISIONS.md), the post-AO panel's seat B (D1). A sandbox day runs the day
   * it copies, its wrinkle and its booked cars, so a bigger car is judged against the morning that
   * was played; this box is the one way to run it plain, and the stage and the close then say what
   * was left out.
   */
  let keepDay = true;
  const keep = el(doc, 'label', 'everyday-tuner-keep-day');
  keep.style.cssText = `display:flex;align-items:center;gap:8px;font-size:13px;color:${C.ink};line-height:1.45`;
  const keepBox = el(doc, 'input', 'everyday-tuner-keep-day-box');
  keepBox.type = 'checkbox';
  keepBox.checked = true;
  keepBox.addEventListener('change', () => {
    keepDay = keepBox.checked;
    redraw();
    context.refreshBar();
  });
  keep.append(keepBox, doc.createTextNode(COPY.keepDay));
  root.append(keep);

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
    /*
     * The name the slider carries into the accessibility tree — WCAG SC 4.1.2, axe's `label` rule,
     * found by `accessibilitySweep.browser.test.ts`. The `label` span above is a sibling rather than
     * a `<label for>`, so the four sliders on this screen reached a non-visual reader unnamed.
     * `row.label` is the sighted reader's own words, which is what SC 2.5.3 asks for.
     */
    input.setAttribute('aria-label', row.label);
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
         * **Held until the run, like the other six** — wave AO, [§ D1368](../../../../DECISIONS.md).
         * This wrote the lever on the press of the chip, so the scored day itself ran on the chosen
         * dwell from then on, run or no run, and leaving the tuner kept it.
         */
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
    const steps = tuneMachineSteps(machineClass, tune, standing);
    /*
     * A design whose class does not carry the set speed or load is snapped back onto the ladder
     * **before** the chips are drawn, not after — a card drawn from one value and lit from another
     * is a control whose selected state is a lie. Only ever downward, `snapToStep`'s own rule, and
     * it is here because the sandbox's copy of the tower would otherwise hand `parseBuilding` a car
     * outside its band.
     *
     * **This used to say it was only reachable through a class change, and that was false.** The
     * ladder is the *catalogue* filtered to the class, and two shipped buildings are specified off
     * the catalogue — Garden Apartments at 0.63 m/s, Crown Hotel at 3.0 — so both were snapped
     * **on mount, before the player touched anything**: Garden opened 21 % slower than the building
     * it named, `movedNow` read `['speed']` on an untouched screen, and the strip announced a
     * sandbox over an edit nobody had made. `tuneMachineSteps` now takes `standing` and offers what
     * the building actually has whenever its class admits it, so the snap fires on the case it was
     * written for and on no other. `tunerModel.test.ts` drives every building in `data/buildings/`
     * through this exact sequence.
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
      for (const row of tuneRowsOffered(card, { mixIsTheDays })) drawSliderRow(body, row);
      if (card.rows.length !== tuneRowsOffered(card, { mixIsTheDays }).length) {
        const kept = el(doc, 'p', 'everyday-tuner-days-own', COPY.lobbyShareIsTheDays);
        kept.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin:0`;
        body.append(kept);
      }
      if (card.dwellChips) {
        if (machineClass !== undefined) {
          drawStepRow(
            body,
            COPY.speedLabel,
            steps.speeds,
            tune.speed,
            tuneSpeedReadout(tune, unitsNow()),
            /*
             * Converted with the readout above it, never left in metres beside a readout in feet —
             * that pairing is § D359's incoherence, each half honest and the two contradictory. The
             * chip is bare because the row names the unit once; `next` is still the SI rung.
             */
            (step) => speedValueFigure(step, unitsNow()),
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
    /* § D1360: while a scored attempt stands this screen runs nothing, so nothing on it is drawn pressable. */
    if (held !== undefined) {
      for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
        'input, button, select',
      )) {
        control.disabled = true;
      }
    }
  }

  redraw();
  host.append(root);

  return {
    /* § 3.3's primary — *Run it and watch*: what moved, then the run, then the stage. */
    primary: () => {
      /*
       * **What moved**, then the run, then the stage — and *nothing* is what an untouched tuner
       * writes, which is GitHub issue #289. `tunerModel.ts#tunePresses` owns that decision and
       * argues it at length; the short form is that this line pressed `applyBuildingSpec`
       * unconditionally, so entering the sandbox and changing nothing re-saved the standing
       * building under a fresh id, and `shift/reportWindow.ts` — which is keyed on the id —
       * stopped recognising Garden Apartments and handed the sheet back the five-minute band it
       * was moved off for `docs/20` defect 5.
       */
      /* § D1360: the bar is inert while an attempt stands; this is the press refusing as well. */
      if (dataHost.attemptHold() !== undefined) return;
      const presses = { ...tunePresses(standingBuilding, pattern, standing, tune), plainDay: !keepDay };
      /*
       * **And the run is a sandbox day's whenever anything moved** — wave AO,
       * [§ D1368](../../../../DECISIONS.md). `runSandbox` parks the week behind a copy of its day and
       * puts it back when the player leaves the stage and the report, so nothing the sandbox does
       * reaches the week, in the page or on disk. With nothing moved the press is the brief's own
       * (`playDay`): an untouched tuner runs the day, and `startRun` here began no attempt, so the day
       * could be watched to its end from this screen and then begun again from the brief (§ D1218).
       */
      /*
       * **And an untouched tuner runs a sandbox day as well** — wave AP lane AP-D2,
       * [§ D1451](../../../../DECISIONS.md), the post-AO panel's seat D (D8). The press used to be the
       * brief's own `playDay` when nothing moved, which began the day's counted attempt with the house
       * driving and nothing on this screen saying so. The counted day starts from its brief, where its
       * driver is picked; a run from here never counts.
       */
      dataHost.runSandbox(presses);
      context.go('stage');
    },
    unmount: () => {
      movedNow = [];
      tunerHost = undefined;
    },
  };
}

/** The registry row — GAMEPLAY § 3.3's tuner screen, mounted by `shell.ts` through `screens.ts`. */
export const TUNER_SCREEN: EverydayScreenModule = {
  key: 'tuner',
  mount,
  /* Start from the table's own row and pick between its two note variants by index. */
  bar: (state) => {
    const model = tunerBarModel(actionBarFor(state), movedNow);
    /* § D1360: while a scored attempt stands, *Run it and watch* would run its day. Inert, with the reason. */
    const held = tunerHost?.attemptHold();
    return held === undefined ? model : { ...model, primary: { ...model.primary, inert: held } };
  },
};
