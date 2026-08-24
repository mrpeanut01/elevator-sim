/**
 * **Design a building** — GAMEPLAY § 13, the DOM half.
 *
 * Every word, every step ladder and every warning is `designerModel.ts`'s; every figure in the
 * specification block is `authoring/buildingSpec.ts#upPeakAnalysisOf`'s, which is the closed form
 * the correctness oracle uses (ENGINE_CONTRACT § 10's rule, and § 20.7's by name). This file draws
 * that with `tokens.ts`'s § 19 values and wires the controls.
 *
 * ## Every control writes, and the writes are one edit
 *
 * The board holds one `BuildingSpec`. A control mutates it, the whole panel re-derives, and the
 * specification block re-runs the closed form — so *move the control and require the run to change*
 * is true by construction here rather than by wiring: there is no path from a control to the screen
 * that does not go through the spec the primary saves. `designerScreen.browser.test.ts` drives it
 * from the other end and compares the legs of two runs.
 *
 * The two presses:
 *
 * - **Save as a new building** — `host.applyBuildingSpec`, which allocates an id, runs the drawn
 *   document through the real loader, and stands the next run on it through `withBuilding`. It does
 *   not run.
 * - **Run a day in it** (§ 3.3's primary, which is the shell's button) — the same apply, then
 *   `startRun`, then `go('stage')`.
 *
 * A spec the loader refuses throws out of the apply. The refusal is drawn where the reader is
 * rather than thrown at the console: `validateSpec` says what would be lost *before* the press, and
 * the catch says what the parser said if it happens anyway.
 */

import {
  BLANK_SPEC,
  banksOf,
  bandOf,
  carLabelOf,
  riseM,
  servesLobby,
  upPeakAnalysisOf,
  validateSpec,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import type { MachineClass } from '../authoring/machineSpec.js';
import {
  automaticClassFor,
  classOfSpec,
  designerCapacityLine,
  designerClasses,
  designerFigures,
  designerPlateRows,
  designerReading,
  designerWarnings,
  loadStepsFor,
  speedStepsFor,
  withMachineClass,
  DESIGNER_COPY as COPY,
} from './designerModel.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

/** § 13.2's brushed-metal plate. The gradient and its two greys are the prototype's own literals. */
const PLATE_STYLE = [
  'border:1px solid #9A948A',
  'border-radius:6px',
  'padding:12px 14px',
  'background:linear-gradient(100deg,#D8D3C8,#EDE9E1 22%,#CFC9BE 46%,#E6E2D9 68%,#C8C2B7)',
  'box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 1px 2px rgba(35,32,28,.18)',
].join(';');

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

function cardStyle(): string {
  return `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:15px 17px;min-width:0`;
}

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  const specs = context.host.elevatorSpecs();
  const classes = designerClasses(specs);

  /*
   * The board opens on the standing building rather than on a blank one. § 13's own reason: the
   * designer exists *because half the lessons in Fix a building are about the building*, and a
   * reader who has just played a day wants to draw the tower they played. `blank tower` is the
   * control that says otherwise, and it is the prototype's own.
   */
  let spec: BuildingSpec = context.host.buildingSpec() ?? BLANK_SPEC;
  let savedLine: string = COPY.savedNothing;

  const root = el(doc, 'div', 'everyday-designer');
  root.style.cssText = 'display:grid;gap:16px;max-width:1180px';

  /* ---------------------------------------------------------------- header */
  const header = el(doc, 'div');
  header.style.cssText = 'display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap';
  const title = el(doc, 'h1', undefined, COPY.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:0`;
  const lede = el(doc, 'span', undefined, COPY.lede);
  lede.style.cssText = `font-size:13px;color:${C.warmGrey};min-width:0;flex:1 1 320px`;
  const blank = el(doc, 'button', 'everyday-designer-blank', COPY.blankLabel);
  blank.type = 'button';
  blank.style.cssText = `margin-left:auto;flex:none;cursor:pointer;background:none;border:1px solid ${C.fainter};color:${C.warmGrey};border-radius:${String(R.control)}px;padding:7px 12px;font:500 11.5px ${TYPE.mono}`;
  header.append(title, lede, blank);
  root.append(header);

  /* --------------------------------------------------- name, save, figures */
  const topRow = el(doc, 'div');
  topRow.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:11px;align-items:stretch';

  const nameCard = el(doc, 'div');
  nameCard.style.cssText = `${cardStyle()};display:flex;flex-direction:column;gap:8px`;
  const nameLabel = el(doc, 'label', undefined, COPY.nameLabel);
  nameLabel.htmlFor = 'everyday-designer-name';
  nameLabel.style.cssText = `${EYEBROW};font-size:10px`;
  const nameInput = el(doc, 'input', 'everyday-designer-name');
  nameInput.id = 'everyday-designer-name';
  nameInput.type = 'text';
  nameInput.value = spec.name;
  nameInput.style.cssText = `width:100%;box-sizing:border-box;background:${C.paper};border:1px solid ${C.rule};border-radius:${String(R.control)}px;color:${C.ink};padding:7px 9px;font-family:${TYPE.heading};font-size:17px;font-weight:600`;
  const saveButton = el(doc, 'button', 'everyday-designer-save', COPY.saveLabel);
  saveButton.type = 'button';
  saveButton.style.cssText = `width:100%;border:0;cursor:pointer;background:${C.sun};color:${C.ink};border-radius:${String(R.row)}px;padding:9px 14px;font-size:13px;font-weight:600`;
  const savedNote = el(doc, 'div', 'everyday-designer-saved', savedLine);
  savedNote.style.cssText = `font-size:11px;color:${C.warmGrey};line-height:1.4;margin-top:auto`;
  nameCard.append(nameLabel, nameInput, saveButton, savedNote);
  topRow.append(nameCard);

  const figureCells: HTMLElement[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cell = el(doc, 'div', 'everyday-designer-figure');
    cell.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.tile)}px;background:${C.card};padding:12px 14px`;
    figureCells.push(cell);
    topRow.append(cell);
  }
  root.append(topRow);

  /* the warning card — § 13.1's, drawn only when there is something in it */
  const warningCard = el(doc, 'div', 'everyday-designer-warnings');
  warningCard.style.cssText = `border:1px solid ${C.amberEdge};border-radius:${String(R.tile)}px;background:${C.amberWash};padding:12px 15px;font-size:13px;line-height:1.5;color:${C.inkSoft};display:grid;gap:5px`;
  root.append(warningCard);

  /* --------------------------------------------------------------- panels */
  const panels = el(doc, 'div');
  panels.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:start';

  const buildingPanel = el(doc, 'div', 'everyday-designer-building');
  buildingPanel.style.cssText = cardStyle();
  const machinePanel = el(doc, 'div', 'everyday-designer-machines');
  machinePanel.style.cssText = cardStyle();
  const servicePanel = el(doc, 'div', 'everyday-designer-service');
  servicePanel.style.cssText = cardStyle();
  panels.append(buildingPanel, machinePanel, servicePanel);
  root.append(panels);

  /* ------------------------------------------------- the specification block */
  const specBlock = el(doc, 'div', 'everyday-designer-spec');
  specBlock.style.cssText = cardStyle();
  root.append(specBlock);

  /*
   * **The drawing board's register is not drawn here any more** — GitHub issue #207 puts all six
   * registers on the settings screen (`everyday/buildNotes.ts`). `DESIGNER_ABSENCES` still names
   * the same five absences; all five were re-worded out of the design document's vocabulary,
   * because this was the one register in the tree with no plain-English row in it. The board keeps
   * the refusal that belongs to a control, which is the specification block's own note about what
   * the closed form cannot tell you.
   */

  /* ---------------------------------------------------------------- wiring */

  function edit(patch: Partial<BuildingSpec>): void {
    spec = { ...spec, ...patch };
    redraw();
  }

  /**
   * One slider row, in the § 13.3 *The building* panel. Every one names the document field it
   * writes underneath, which is `dev/buildingEditor.ts#specFieldOf`'s own decision carried across:
   * a control whose effect is stated is a control that can be checked.
   */
  function sliderRow(
    parent: HTMLElement,
    label: string,
    writes: string,
    bounds: { min: number; max: number; step: number },
    value: number,
    unit: string,
    onInput: (next: number) => void,
  ): void {
    const row = el(doc, 'div', 'everyday-designer-row');
    row.style.cssText = 'display:grid;gap:4px';
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px';
    const name = el(doc, 'span', undefined, label);
    name.style.cssText = 'font-size:13.5px;font-weight:600';
    const readout = el(doc, 'span', 'everyday-designer-readout', `${String(value)}${unit}`);
    readout.style.cssText = `margin-left:auto;flex:none;font:500 12.5px ${TYPE.mono};color:${C.terracotta}`;
    head.append(name, readout);
    const input = el(doc, 'input');
    input.type = 'range';
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(bounds.step);
    input.value = String(value);
    input.style.cssText = 'width:100%';
    input.addEventListener('input', () => {
      onInput(Number(input.value));
    });
    const field = el(doc, 'div', undefined, writes);
    field.style.cssText = `font:500 10px ${TYPE.mono};color:${C.faint}`;
    row.append(head, input, field);
    parent.append(row);
  }

  /** One stepped chip row — § 10.1's *steps within the class, never free numbers*. */
  function stepRow(
    parent: HTMLElement,
    label: string,
    steps: readonly number[],
    value: number,
    format: (step: number) => string,
    onPick: (next: number) => void,
  ): void {
    const row = el(doc, 'div');
    row.style.cssText = 'display:grid;gap:5px';
    const name = el(doc, 'div', undefined, label);
    name.style.cssText = 'font-size:13.5px;font-weight:600';
    const chips = el(doc, 'div', 'everyday-designer-steps');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px';
    for (const step of steps) {
      const selected = step === value;
      const chip = el(doc, 'button', 'everyday-designer-step', format(step));
      chip.type = 'button';
      chip.style.cssText = `cursor:pointer;border:1.5px solid ${selected ? C.sun : C.rule};background:${selected ? C.sun : C.paper};color:${C.ink};border-radius:${String(R.pill)}px;padding:5px 11px;font:500 11.5px ${TYPE.mono}`;
      chip.addEventListener('click', () => {
        onPick(step);
      });
      chips.append(chip);
    }
    row.append(name, chips);
    parent.append(row);
  }

  function drawBuildingPanel(): void {
    buildingPanel.replaceChildren();
    const heading = el(doc, 'div', undefined, COPY.buildingEyebrow);
    heading.style.cssText = `${EYEBROW};margin-bottom:12px`;
    buildingPanel.append(heading);
    const rows = el(doc, 'div');
    rows.style.cssText = 'display:grid;gap:14px';
    buildingPanel.append(rows);
    sliderRow(
      rows,
      'Floors above the lobby',
      'floors[] — plus the lobby, which is always floor 0',
      { min: 3, max: 120, step: 1 },
      spec.floors,
      '',
      (next) => {
        edit({ floors: next });
      },
    );
    sliderRow(
      rows,
      'Floor to floor',
      'floors[].heightM',
      { min: 2.6, max: 5, step: 0.1 },
      spec.floorHeightM,
      ' m',
      (next) => {
        edit({ floorHeightM: next });
      },
    );
    sliderRow(
      rows,
      'Design capacity per floor',
      'floors[].population = capacity × occupancy',
      { min: 10, max: 200, step: 5 },
      spec.capacityPerFloor,
      ' people',
      (next) => {
        edit({ capacityPerFloor: next });
      },
    );
    sliderRow(
      rows,
      'Occupied share',
      'floors[].population = capacity × occupancy',
      { min: 0, max: 120, step: 1 },
      spec.occupancyPct,
      '%',
      (next) => {
        edit({ occupancyPct: next });
      },
    );
    sliderRow(
      rows,
      'Shafts',
      'banks[].cars[] — the most expensive thing in the building',
      { min: 1, max: 12, step: 1 },
      spec.cars,
      '',
      (next) => {
        edit({ cars: next, bandByCar: {}, noLobby: {} });
      },
    );
  }

  function drawMachinePanel(machineClass: MachineClass | undefined): void {
    machinePanel.replaceChildren();
    const heading = el(doc, 'div', undefined, COPY.machinesEyebrow);
    heading.style.cssText = `${EYEBROW};margin-bottom:10px`;
    machinePanel.append(heading);

    const list = el(doc, 'div', 'everyday-designer-classes');
    list.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:11px';
    for (const entry of classes) {
      const selected = entry.id === spec.specClass;
      const chip = el(doc, 'button', 'everyday-designer-class', entry.name);
      chip.type = 'button';
      chip.style.cssText = `cursor:pointer;border:1.5px solid ${selected ? C.ink : C.rule};background:${selected ? C.ink : C.paper};color:${selected ? C.paper : C.ink};border-radius:${String(R.pill)}px;padding:6px 12px;font-size:12px;font-weight:600`;
      chip.addEventListener('click', () => {
        spec = withMachineClass(spec, entry);
        redraw();
      });
      list.append(chip);
    }
    machinePanel.append(list);

    if (machineClass !== undefined) {
      const limits = el(
        doc,
        'div',
        'everyday-designer-limits',
        `${machineClass.speedMinMps.toFixed(2)}–${machineClass.speedMaxMps.toFixed(2)} m/s · up to ${String(machineClass.maxFloors)} floors and ${String(machineClass.maxRiseM)} m of rise`,
      );
      limits.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey};margin-bottom:11px`;
      const application = el(doc, 'div', undefined, machineClass.application);
      application.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-bottom:12px`;
      machinePanel.append(limits, application);
    }

    const steps = el(doc, 'div');
    steps.style.cssText = 'display:grid;gap:12px';
    machinePanel.append(steps);
    if (machineClass !== undefined) {
      stepRow(
        steps,
        'Rated speed',
        speedStepsFor(machineClass),
        spec.ratedSpeedMps,
        (step) => `${step.toFixed(2)} m/s`,
        (next) => {
          edit({ ratedSpeedMps: next });
        },
      );
      stepRow(
        steps,
        'Rated load',
        loadStepsFor(machineClass),
        spec.ratedLoadLb,
        (step) => `${String(step)} lb`,
        (next) => {
          edit({ ratedLoadLb: next });
        },
      );
    }
    const hint = el(doc, 'p', undefined, COPY.machineStepsHint);
    hint.style.cssText = `font-size:12px;color:${C.warmGrey};line-height:1.45;margin:11px 0 0`;
    machinePanel.append(hint);

    /*
     * The class § 10.1's automatic choice would have picked, offered rather than applied. Applying
     * it silently would move a class the reader chose; saying which one it is teaches the rule the
     * guide states, which is what a drawing board is for.
     */
    const automatic = automaticClassFor(classes, riseM(spec), spec.floors);
    if (automatic !== undefined && automatic.id !== spec.specClass) {
      const suggest = el(
        doc,
        'button',
        'everyday-designer-auto-class',
        `A tower this tall is ordinarily built with ${automatic.name} — use it`,
      );
      suggest.type = 'button';
      suggest.style.cssText = `margin-top:10px;cursor:pointer;background:none;border:1px solid ${C.rule};color:${C.inkSoft};border-radius:${String(R.control)}px;padding:7px 11px;font-size:12px;text-align:left`;
      suggest.addEventListener('click', () => {
        spec = withMachineClass(spec, automatic);
        redraw();
      });
      machinePanel.append(suggest);
    }
  }

  /**
   * § 10.2's service ranges, one row per shaft: the band it calls at, and whether it opens at the
   * lobby.
   *
   * These are the two fields `BuildingSpec` has for the question — `bandByCar` and `noLobby` — and
   * they are § 10.2's *its zone's bands* and its *shuttle* respectively. A shaft with no pinned band
   * shows the one it was dealt, which is what `bandOf` answers.
   */
  function drawServicePanel(): void {
    servicePanel.replaceChildren();
    const heading = el(doc, 'div', undefined, COPY.zonesEyebrow);
    heading.style.cssText = `${EYEBROW};margin-bottom:10px`;
    servicePanel.append(heading);

    const banks = banksOf(spec);
    const legend = el(
      doc,
      'div',
      'everyday-designer-banks',
      banks.length === 1
        ? 'One bank: every shaft opens onto the same floors.'
        : `${String(banks.length)} banks — a shaft that opens onto different floors is a different bank.`,
    );
    legend.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-bottom:11px`;
    servicePanel.append(legend);

    const rows = el(doc, 'div');
    rows.style.cssText = 'display:grid;gap:9px';
    servicePanel.append(rows);
    for (let car = 0; car < spec.cars; car += 1) {
      const band = bandOf(spec, car);
      const lobby = servesLobby(spec, car);
      const row = el(doc, 'div', 'everyday-designer-shaft');
      row.style.cssText = `display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid ${C.ruleLight};border-radius:${String(R.row)}px;background:${C.paper};flex-wrap:wrap`;
      const letter = el(doc, 'span', undefined, carLabelOf(car));
      letter.style.cssText = `flex:none;width:22px;text-align:center;font:600 12px ${TYPE.mono};color:${C.ink}`;
      const from = numberField(String(band[0]), (next) => {
        edit({ bandByCar: { ...spec.bandByCar, [car]: [next, Math.max(next, band[1])] } });
      });
      const to = numberField(String(band[1]), (next) => {
        edit({ bandByCar: { ...spec.bandByCar, [car]: [Math.min(band[0], next), next] } });
      });
      const between = el(doc, 'span', undefined, 'calls at');
      between.style.cssText = `font-size:12px;color:${C.warmGrey};flex:none`;
      const dash = el(doc, 'span', undefined, '→');
      dash.style.cssText = `font-size:12px;color:${C.faint};flex:none`;
      const shuttle = el(doc, 'button', 'everyday-designer-shuttle', lobby ? 'local' : 'shuttle');
      shuttle.type = 'button';
      shuttle.style.cssText = `margin-left:auto;flex:none;cursor:pointer;border:1.5px solid ${lobby ? C.rule : C.sun};background:${lobby ? C.card : C.sun};color:${C.ink};border-radius:${String(R.pill)}px;padding:4px 11px;font:500 11px ${TYPE.mono}`;
      shuttle.addEventListener('click', () => {
        edit({ noLobby: { ...spec.noLobby, [car]: lobby } });
      });
      row.append(letter, between, from, dash, to, shuttle);
      rows.append(row);
    }
  }

  function numberField(value: string, onCommit: (next: number) => void): HTMLInputElement {
    const input = el(doc, 'input', 'everyday-designer-band');
    input.type = 'number';
    input.value = value;
    input.style.cssText = `width:56px;flex:none;box-sizing:border-box;border:1px solid ${C.rule};border-radius:${String(R.tight)}px;background:${C.card};padding:4px 6px;font:500 12px ${TYPE.mono};color:${C.ink}`;
    input.addEventListener('change', () => {
      const next = Number(input.value);
      if (Number.isFinite(next)) onCommit(Math.round(next));
    });
    return input;
  }

  function drawSpecBlock(): void {
    specBlock.replaceChildren();
    const heading = el(doc, 'div', undefined, COPY.specEyebrow);
    heading.style.cssText = `${EYEBROW};margin-bottom:8px`;
    const note = el(doc, 'p', 'everyday-designer-spec-note', COPY.specNote);
    note.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;margin:0 0 13px;max-width:80ch`;
    specBlock.append(heading, note);

    const machineClass = classOfSpec(classes, spec);
    const plate = el(doc, 'div', 'everyday-designer-plate');
    plate.style.cssText = PLATE_STYLE;
    const plateGrid = el(doc, 'div');
    plateGrid.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px 14px';
    for (const row of designerPlateRows(spec, machineClass)) {
      const cell = el(doc, 'div');
      const key = el(doc, 'div', undefined, row.key);
      key.style.cssText = `font:500 9px ${TYPE.mono};letter-spacing:.16em;color:#5A554C`;
      const value = el(doc, 'div', undefined, row.value);
      value.style.cssText = `font:600 15px ${TYPE.mono};letter-spacing:-.02em;color:#2E2A24;margin-top:1px`;
      cell.append(key, value);
      plateGrid.append(cell);
    }
    plate.append(plateGrid);
    specBlock.append(plate);

    const capacity = el(doc, 'div', 'everyday-designer-capacity', designerCapacityLine(spec));
    capacity.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.moss};margin-top:10px;line-height:1.5`;
    specBlock.append(capacity);

    const analysis = analysisNow();
    const reading = designerReading(analysis);
    if (reading !== '') {
      const readingNode = el(doc, 'div', 'everyday-designer-reading', reading);
      readingNode.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:4px;line-height:1.5;max-width:80ch`;
      specBlock.append(readingNode);
    }

    if (analysis.refusal !== '') {
      const refusal = el(doc, 'div', 'everyday-designer-refusal', analysis.refusal);
      refusal.style.cssText = `font-size:12.5px;color:${C.alarm};margin-top:9px;line-height:1.5`;
      specBlock.append(refusal);
    }
    for (const bank of analysis.banks) {
      const line = el(
        doc,
        'div',
        'everyday-designer-bank',
        bank.refusal !== '' ? bank.refusal : bank.line,
      );
      line.style.cssText = `font:500 11.5px ${TYPE.mono};color:${bank.refusal !== '' ? C.alarm : C.inkSoft};margin-top:7px;line-height:1.55`;
      specBlock.append(line);
      for (const warning of bank.warnings) {
        const warn = el(doc, 'div', 'everyday-designer-bank-warning', warning);
        warn.style.cssText = `font-size:12px;color:${C.terracotta};margin-top:3px;line-height:1.5;max-width:86ch`;
        specBlock.append(warn);
      }
    }

    const problems = validateSpec(spec, machineClass);
    for (const problem of problems) {
      const line = el(doc, 'div', 'everyday-designer-problem', problem);
      line.style.cssText = `font-size:12.5px;color:${C.terracotta};margin-top:7px;line-height:1.5;max-width:86ch`;
      specBlock.append(line);
    }

    const notScored = el(doc, 'div', 'everyday-designer-not-scored', COPY.notScored);
    notScored.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:12px;font-style:italic`;
    specBlock.append(notScored);
  }

  /**
   * The closed form, run fresh on every redraw.
   *
   * A throw here is not possible — `upPeakAnalysisOf` catches the loader and every bank — so there
   * is no fallback branch to write, and a `NaN` is what a fallback would have produced.
   */
  function analysisNow(): ReturnType<typeof upPeakAnalysisOf> {
    return upPeakAnalysisOf(spec, specs);
  }

  function redraw(): void {
    const analysis = analysisNow();
    const machineClass = classOfSpec(classes, spec);

    for (const [index, figure] of designerFigures(spec, analysis).entries()) {
      const cell = figureCells[index];
      if (cell === undefined) continue;
      cell.replaceChildren();
      const value = el(doc, 'div', 'everyday-designer-figure-value', figure.value);
      value.style.cssText = `font:500 20px ${TYPE.mono};color:${figure.withheld ? C.warmGrey : C.ink};letter-spacing:-.02em`;
      const label = el(doc, 'div', undefined, figure.label);
      label.style.cssText = 'font-size:12.5px;font-weight:600;margin-top:4px';
      const note = el(doc, 'div', 'everyday-designer-figure-note', figure.note);
      note.style.cssText = `font-size:11.5px;color:${C.warmGrey};line-height:1.4;margin-top:2px`;
      cell.append(value, label, note);
    }

    const warnings = designerWarnings(spec, machineClass, analysis);
    warningCard.replaceChildren();
    warningCard.hidden = warnings.length === 0;
    for (const warning of warnings) {
      const line = el(doc, 'div', `everyday-designer-warning-${warning.severity}`, warning.text);
      line.style.cssText = `color:${warning.severity === 'class' ? C.alarm : C.inkSoft}`;
      warningCard.append(line);
    }

    drawBuildingPanel();
    drawMachinePanel(machineClass);
    drawServicePanel();
    drawSpecBlock();
    savedNote.textContent = savedLine;
  }

  function applyAndReport(): string | undefined {
    try {
      const id = context.host.applyBuildingSpec(spec);
      savedLine = `Saved as ${id}. The next run stands on it.`;
      return id;
    } catch (error) {
      /* The loader's own refusal, quoted — `upPeakAnalysisOf`'s precedent, one seam up. */
      savedLine = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  }

  nameInput.addEventListener('input', () => {
    spec = { ...spec, name: nameInput.value };
  });
  saveButton.addEventListener('click', () => {
    applyAndReport();
    savedNote.textContent = savedLine;
  });
  blank.addEventListener('click', () => {
    spec = BLANK_SPEC;
    nameInput.value = spec.name;
    savedLine = COPY.savedNothing;
    redraw();
  });

  redraw();
  host.append(root);

  return {
    /* § 3.3's primary — *Run a day in it*: apply, run, and hand off to the stage. */
    primary: () => {
      if (applyAndReport() === undefined) {
        savedNote.textContent = savedLine;
        return;
      }
      savedNote.textContent = savedLine;
      context.host.startRun();
      context.go('stage');
    },
  };
}

/**
 * The registry row. § 3.3's designer row is static — `⌂ Modes`, no back, no timeline, primary
 * *Run a day in it*, note *Nothing here is scored. It is a drawing board.* — so there is no `bar()`
 * refinement: `actionBar.ts` already resolves the row whole, and a refinement that re-stated the
 * note would be the same sentence in two places.
 */
export const DESIGNER_SCREEN: EverydayScreenModule = {
  key: 'designer',
  mount,
};
