/**
 * **Design a building** — GAMEPLAY § 13, the DOM half.
 *
 * Every word, every step ladder and every warning is `designerModel.ts`'s; every figure is
 * `authoring/towerPlan.ts#planAnalysisOf`'s, which runs the drawing through the real loader and the
 * closed form the correctness oracle uses (ENGINE_CONTRACT § 10's rule, and § 20.7's by name). This
 * file draws that with `tokens.ts`'s § 19 values and wires the controls.
 *
 * ## The screen is a picture of the building, and the controls act on what is picked in it
 *
 * The board it replaces was three columns of sliders and a row of number boxes per shaft: nothing
 * on it showed the tower, and every shaft's row repeated the same controls. Here the building is
 * drawn to scale — its width from the shafts, its silhouette from how far each shaft reaches
 * (`towerPlan.ts#layoutOf`, the massing rule) — and a reader picks a shaft or a floor in the
 * drawing and changes it in one side panel. Four steps choose what the side panel offers: **Shape**,
 * **Lifts**, **Floors**, **Service**.
 *
 * Nothing is reachable only by pointer. The chips over the drawing pick shafts, the Floors step has
 * a floor field, and every edit a drag makes is also a stepper in the side panel.
 *
 * ## Every control writes, and the writes are one edit
 *
 * The board holds one `TowerPlan`. A control replaces it, the screen re-derives, and the analysis
 * re-runs — so *move the control and require the run to change* is true by construction: there is
 * no path from a control to the screen that does not go through the plan the primary saves.
 * `authoring/towerPlan.test.ts` holds each kind of edit to the legs of a run.
 *
 * The two presses:
 *
 * - **Save as a new building** — `host.applyTowerPlan`, which allocates an id, runs the drawn
 *   document through the real loader, and stands the next run on it through `withBuilding`. It does
 *   not run.
 * - **Run a day in it** (§ 3.3's primary, which is the shell's button) — the same apply, then
 *   `startRun`, then `go('stage')`.
 *
 * A plan the loader refuses throws out of the apply. The refusal is drawn where the reader is: the
 * warning card says what the engine will not build *before* the press, in the engine's own words,
 * and the catch says it again if the press happens anyway.
 *
 * ## Why a trip to the Engineer surface cannot leave this screen stale, and why it must not redraw
 *
 * GitHub issue #535. The board reads the host twice, both at mount: `elevatorSpecs()`, stable for
 * the life of the page, and `buildingPlan()`, which seeds the drawing from the standing building.
 * Everything drawn after that is `plan` — the player's own document. Re-reading the seed on the way
 * back would replace a tower the player has been drawing with whatever building the other world
 * happens to be standing on. `unitsNow()` is per draw and reads the profile store, not the host.
 */

import type { MachineClass } from '../authoring/machineSpec.js';
import {
  PLAN_DUTIES,
  PLAN_SERVICE_KINDS,
  PLAN_TEMPLATES,
  autoPopulationAt,
  blankPlan,
  groupIndexByShaft,
  groupsOf,
  layoutOf,
  planAnalysisOf,
  planFloorId,
  planLowestFloor,
  planPopulationAt,
  shaftLabelOf,
  shaftRiseM,
  withAutoZones,
  withBasements,
  withCars,
  withDecks,
  withEscalatorToggled,
  withFloors,
  withPopulation,
  withShaftAdded,
  withShaftCopied,
  withShafts,
  withShaftsRemoved,
  withWing,
  withSkyLobbyToggled,
  withStopToggled,
  withUse,
  writtenStopsOf,
  type PlanAnalysis,
  type PlanShaft,
  type TowerLayout,
  type TowerPlan,
} from '../authoring/towerPlan.js';
import {
  automaticClassFor,
  classOfMachine,
  designerCapacityLine,
  designerClasses,
  designerFigures,
  designerFloorFacts,
  designerGroupRows,
  designerLossLine,
  designerPlateRows,
  designerReading,
  designerServiceLine,
  designerShaftRows,
  designerWarnings,
  loadStepsFor,
  speedStepsFor,
  withPlanMachineClass,
  withPlanMachineStep,
  DESIGNER_COPY as COPY,
  DESIGNER_DUTY_COPY,
  DESIGNER_KIND_COPY,
  DESIGNER_PROFILE_BY_KIND,
  DESIGNER_SERVICE_COPY,
  DESIGNER_STEPS,
  DESIGNER_TEMPLATE_COPY,
  type DesignerStep,
} from './designerModel.js';
import { actionBarFor, type ActionBarModel } from './actionBar.js';
import { everydayProfileStore } from './profileStore.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayState } from './types.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import {
  lengthFigure,
  speedFigure,
  speedRangeFigure,
  type EverydayUnits,
} from './units.js';

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
const HINT = `font-size:12px;color:${C.warmGrey};line-height:1.45;margin:0`;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * One colour per lift group, cycled. Colour is never the only way a group is told apart: the list
 * under the drawing names each group's shafts by letter, and a picked shaft is outlined in ink.
 */
const GROUP_COLORS: readonly string[] = Object.freeze([
  '#4E9DD8',
  '#4F8A5B',
  '#B8462B',
  '#7A5EA8',
  '#2F8F8A',
  '#C4577A',
  '#8A6D1F',
  '#56667A',
]);

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

function shape(doc: Document, tag: string, attrs: Readonly<Record<string, string | number>>): SVGElement {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function cardStyle(): string {
  return `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:15px 17px;min-width:0`;
}

/** Where everything in the drawing is, in the drawing's own pixels. */
interface Geometry {
  readonly width: number;
  readonly height: number;
  /** Left edge of the building. */
  readonly left: number;
  /** Top edge of the top floor. */
  readonly top: number;
  /** One shaft bay. */
  readonly bay: number;
  /** One floor. */
  readonly floor: number;
  readonly lowest: number;
  readonly highest: number;
}

const GUTTER_LEFT = 46;
const GUTTER_RIGHT = 104;
const MARGIN_TOP = 28;
const MARGIN_BOTTOM = 14;

function geometryOf(plan: TowerPlan, layout: TowerLayout): Geometry {
  const lowest = planLowestFloor(plan);
  const storeys = plan.floors - lowest + 1;
  const floor = Math.max(5, Math.min(30, 540 / storeys));
  const bay = Math.max(16, Math.min(50, 620 / layout.width));
  return {
    width: GUTTER_LEFT + layout.width * bay + GUTTER_RIGHT,
    height: MARGIN_TOP + storeys * floor + MARGIN_BOTTOM,
    left: GUTTER_LEFT,
    top: MARGIN_TOP,
    bay,
    floor,
    lowest,
    highest: plan.floors,
  };
}

/** The top edge of one floor's row. */
function yOf(g: Geometry, floor: number): number {
  return g.top + (g.highest - floor) * g.floor;
}

/**
 * The host of the board that is mounted, for {@link designerBar}: the registry's `bar` is a function
 * of the shell's state alone, and whether an attempt holds the day is the host's to say (§ D1360).
 */
let designerHost: EverydayScreenShellContext['host'] | undefined;

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  designerHost = context.host;
  const specs = context.host.elevatorSpecs();
  const classes = designerClasses(specs);

  /*
   * The board opens on the standing building rather than on a blank one. § 13's own reason: the
   * designer exists *because half the lessons in Fix a building are about the building*, and a
   * reader who has just played a day wants to draw the tower they played. The starting points in
   * the header are the controls that say otherwise.
   */
  const opened = context.host.buildingPlan();
  let plan: TowerPlan = opened?.plan ?? blankPlan();
  let lossLine = opened === undefined ? '' : designerLossLine(opened.plan.name, opened.notCarried);
  let savedLine: string = COPY.savedNothing;
  let step: DesignerStep['id'] = 'shape';
  let pickedShafts: readonly string[] = [];
  let pickedFloors: readonly [number, number] | undefined;
  let analysis: PlanAnalysis = planAnalysisOf(plan, specs);
  let documentOpen = false;

  /**
   * How this screen's machine specifications read — § 15.1's `Units` row. Read per draw rather than
   * captured at mount: the preference is set on another screen. **Presentation only** — nothing it
   * returns reaches `plan`; every use below is inside a string.
   */
  const unitsNow = (): EverydayUnits => everydayProfileStore().units();

  const root = el(doc, 'div', 'everyday-designer');
  root.style.cssText = 'display:grid;gap:14px;max-width:1240px';

  /* ---------------------------------------------------------------- header */
  const header = el(doc, 'div');
  header.style.cssText = 'display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap';
  const title = el(doc, 'h1', undefined, COPY.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:0`;
  const lede = el(doc, 'span', undefined, COPY.lede);
  lede.style.cssText = `font-size:13px;color:${C.warmGrey};min-width:0;flex:1 1 320px`;
  header.append(title, lede);
  root.append(header);

  const templates = el(doc, 'div', 'everyday-designer-templates');
  templates.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap';
  const templatesLabel = el(doc, 'span', undefined, COPY.templatesEyebrow);
  templatesLabel.style.cssText = `${EYEBROW};margin-right:4px`;
  templates.append(templatesLabel);
  for (const template of PLAN_TEMPLATES) {
    const copy = DESIGNER_TEMPLATE_COPY[template.id];
    const chip = el(
      doc,
      'button',
      template.id === 'blank' ? 'everyday-designer-template everyday-designer-blank' : 'everyday-designer-template',
      copy?.name ?? template.id,
    );
    chip.type = 'button';
    chip.title = copy?.blurb ?? '';
    chip.dataset['template'] = template.id;
    chip.style.cssText = `cursor:pointer;background:${C.paper};border:1px solid ${C.fainter};color:${C.inkSoft};border-radius:${String(R.pill)}px;padding:5px 12px;font-size:12px;font-weight:600`;
    chip.addEventListener('click', () => {
      plan = template.make();
      nameInput.value = plan.name;
      lossLine = '';
      savedLine = COPY.savedNothing;
      pickedShafts = [];
      pickedFloors = undefined;
      redraw();
    });
    templates.append(chip);
  }
  root.append(templates);

  /* --------------------------------------------------- name, save, figures */
  const topRow = el(doc, 'div');
  topRow.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:11px;align-items:stretch';

  const nameCard = el(doc, 'div');
  nameCard.style.cssText = `${cardStyle()};display:flex;flex-direction:column;gap:8px`;
  const nameLabel = el(doc, 'label', undefined, COPY.nameLabel);
  nameLabel.htmlFor = 'everyday-designer-name';
  nameLabel.style.cssText = `${EYEBROW};font-size:10px`;
  const nameInput = el(doc, 'input', 'everyday-designer-name');
  nameInput.id = 'everyday-designer-name';
  nameInput.type = 'text';
  nameInput.value = plan.name;
  nameInput.style.cssText = `width:100%;box-sizing:border-box;background:${C.paper};border:1px solid ${C.rule};border-radius:${String(R.control)}px;color:${C.ink};padding:7px 9px;font-family:${TYPE.heading};font-size:17px;font-weight:600`;
  const saveButton = el(doc, 'button', 'everyday-designer-save', COPY.saveLabel);
  saveButton.type = 'button';
  saveButton.style.cssText = `width:100%;border:0;cursor:pointer;background:${C.sun};color:${C.ink};border-radius:${String(R.row)}px;padding:9px 14px;font-size:13px;font-weight:600`;
  const savedNote = el(doc, 'div', 'everyday-designer-saved', savedLine);
  savedNote.style.cssText = `font-size:11px;color:${C.warmGrey};line-height:1.4;margin-top:auto`;
  nameCard.append(nameLabel, nameInput, saveButton, savedNote);
  topRow.append(nameCard);

  const figureRow = el(doc, 'div', 'everyday-designer-figures');
  figureRow.style.cssText = 'display:contents';
  topRow.append(figureRow);
  root.append(topRow);

  /*
   * The two cards below carry no inline `display`, and that is a fix rather than a style
   * preference — GitHub issue #295's F29. Each is emptied and hidden by `.hidden = …`, and an
   * inline `display` outranks the user agent's `[hidden] { display: none }`, so the card would keep
   * its border and its wash while claiming to be hidden. `hiddenBox.test.ts` holds that for every
   * `.hidden` site in this directory.
   */
  const lossNote = el(doc, 'div', 'everyday-designer-opened');
  lossNote.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.tile)}px;background:${C.cardSunk};padding:10px 15px;font-size:12.5px;line-height:1.5;color:${C.inkSoft}`;
  root.append(lossNote);

  const warningCard = el(doc, 'div', 'everyday-designer-warnings');
  warningCard.style.cssText = `border:1px solid ${C.amberEdge};border-radius:${String(R.tile)}px;background:${C.amberWash};padding:12px 15px;font-size:13px;line-height:1.5;color:${C.inkSoft}`;
  root.append(warningCard);

  /* ------------------------------------------------------------- the steps */
  const tabs = el(doc, 'div', 'everyday-designer-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Steps');
  tabs.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
  root.append(tabs);

  /* --------------------------------------------------- the drawing, and the side panel */
  const work = el(doc, 'div');
  work.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;align-items:start';
  const stage = el(doc, 'div', 'everyday-designer-stage');
  stage.style.cssText = `${cardStyle()};grid-column:span 2;display:grid;gap:10px`;
  const side = el(doc, 'div', 'everyday-designer-side');
  side.style.cssText = `${cardStyle()};display:grid;gap:14px;align-content:start`;
  work.append(stage, side);
  root.append(work);

  const chipBar = el(doc, 'div', 'everyday-designer-shaft-chips');
  chipBar.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;align-items:center';
  const canvasHint = el(doc, 'p', 'everyday-designer-canvas-hint');
  canvasHint.style.cssText = HINT;
  const canvasWrap = el(doc, 'div', 'everyday-designer-canvas');
  canvasWrap.style.cssText = `overflow:auto;max-height:640px;border:1px solid ${C.ruleLight};border-radius:${String(R.well)}px;background:${C.paper};padding:6px;touch-action:none`;
  const legend = el(doc, 'div', 'everyday-designer-legend');
  legend.style.cssText = `display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:${C.warmGrey}`;
  stage.append(chipBar, canvasHint, canvasWrap, legend);

  const groupsCard = el(doc, 'div', 'everyday-designer-groups');
  groupsCard.style.cssText = cardStyle();
  root.append(groupsCard);

  const specBlock = el(doc, 'div', 'everyday-designer-spec');
  specBlock.style.cssText = cardStyle();
  root.append(specBlock);

  /* ---------------------------------------------------------------- edits */

  /** Shafts still in the plan, of the ones picked. */
  function picked(): readonly PlanShaft[] {
    return plan.shafts.filter((shaft) => pickedShafts.includes(shaft.key));
  }

  function prune(): void {
    pickedShafts = pickedShafts.filter((key) => plan.shafts.some((shaft) => shaft.key === key));
    if (pickedFloors !== undefined) {
      const lowest = planLowestFloor(plan);
      const clamp = (floor: number): number => Math.max(lowest, Math.min(plan.floors, floor));
      pickedFloors = [clamp(pickedFloors[0]), clamp(pickedFloors[1])];
    }
  }

  /**
   * Replace the plan and re-derive. `keepSide` leaves the side panel's own DOM alone — a slider
   * being dragged is an element, and replacing it mid-drag ends the drag — and a slider's `change`
   * then redraws everything once the hand is off it.
   */
  function edit(next: TowerPlan, keepSide = false): void {
    plan = next;
    prune();
    redraw(keepSide);
  }

  /* --------------------------------------------------------- small builders */

  function sectionLabel(parent: HTMLElement, text: string): void {
    const label = el(doc, 'div', undefined, text);
    label.style.cssText = EYEBROW;
    parent.append(label);
  }

  function hint(parent: HTMLElement, text: string, className?: string): void {
    const node = el(doc, 'p', className, text);
    node.style.cssText = HINT;
    parent.append(node);
  }

  function fieldName(parent: HTMLElement, text: string): void {
    const name = el(doc, 'div', undefined, text);
    name.style.cssText = 'font-size:13.5px;font-weight:600';
    parent.append(name);
  }

  function button(parent: HTMLElement, className: string, text: string, key: string, onPress: () => void): HTMLButtonElement {
    const node = el(doc, 'button', className, text);
    node.type = 'button';
    node.dataset['k'] = key;
    node.style.cssText = `cursor:pointer;border:1.5px solid ${C.rule};background:${C.paper};color:${C.ink};border-radius:${String(R.pill)}px;padding:5px 12px;font-size:12px;font-weight:600`;
    node.addEventListener('click', onPress);
    parent.append(node);
    return node;
  }

  /** A row of chips of which one (or none) is on. Each is a button carrying `aria-pressed`. */
  function chipRow<T extends string | number>(
    parent: HTMLElement,
    className: string,
    key: string,
    options: readonly { readonly value: T; readonly label: string; readonly title?: string | undefined }[],
    selected: T | undefined,
    onPick: (value: T) => void,
    tone: 'sun' | 'ink' = 'sun',
  ): void {
    const chips = el(doc, 'div', `${className}s`);
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px';
    for (const option of options) {
      const on = option.value === selected;
      const chip = el(doc, 'button', className, option.label);
      chip.type = 'button';
      chip.dataset['k'] = `${key}:${String(option.value)}`;
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (option.title !== undefined) chip.title = option.title;
      const fill = tone === 'ink' ? C.ink : C.sun;
      const text = on && tone === 'ink' ? C.paper : C.ink;
      chip.style.cssText = `cursor:pointer;border:1.5px solid ${on ? fill : C.rule};background:${on ? fill : C.paper};color:${text};border-radius:${String(R.pill)}px;padding:5px 11px;font:500 11.5px ${TYPE.mono}`;
      chip.addEventListener('click', () => {
        onPick(option.value);
      });
      chips.append(chip);
    }
    parent.append(chips);
  }

  /**
   * One slider row. `input` re-derives everything but this panel, so the thumb under the reader's
   * hand survives; `change` redraws the panel too. The name is carried into the accessibility tree
   * with `aria-label` — WCAG SC 4.1.2, found by `accessibilitySweep.browser.test.ts`.
   */
  function sliderRow(
    parent: HTMLElement,
    label: string,
    bounds: { min: number; max: number; step: number },
    value: number,
    format: (value: number) => string,
    apply: (current: TowerPlan, next: number) => TowerPlan,
  ): void {
    const row = el(doc, 'div', 'everyday-designer-row');
    row.style.cssText = 'display:grid;gap:4px';
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px';
    const name = el(doc, 'span', undefined, label);
    name.style.cssText = 'font-size:13.5px;font-weight:600';
    const readout = el(doc, 'span', 'everyday-designer-readout', format(value));
    readout.style.cssText = `margin-left:auto;flex:none;font:500 12.5px ${TYPE.mono};color:${C.terracotta}`;
    head.append(name, readout);
    const input = el(doc, 'input');
    input.type = 'range';
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(bounds.step);
    input.value = String(value);
    input.dataset['k'] = `slider:${label}`;
    input.setAttribute('aria-label', label);
    input.style.cssText = 'width:100%';
    input.addEventListener('input', () => {
      const next = Number(input.value);
      readout.textContent = format(next);
      edit(apply(plan, next), true);
    });
    input.addEventListener('change', () => {
      redraw();
    });
    row.append(head, input);
    parent.append(row);
  }

  /** A small whole-number field that commits on `change`. `label` is its accessible name. */
  function numberField(
    parent: HTMLElement,
    label: string,
    value: number,
    onCommit: (next: number) => void,
  ): HTMLInputElement {
    const input = el(doc, 'input', 'everyday-designer-number');
    input.type = 'number';
    input.value = String(value);
    input.dataset['k'] = `number:${label}`;
    input.setAttribute('aria-label', label);
    input.style.cssText = `width:68px;flex:none;box-sizing:border-box;border:1px solid ${C.rule};border-radius:${String(R.tight)}px;background:${C.paper};padding:5px 7px;font:500 12.5px ${TYPE.mono};color:${C.ink}`;
    input.addEventListener('change', () => {
      const next = Number(input.value);
      if (Number.isFinite(next)) onCommit(Math.round(next));
    });
    parent.append(input);
    return input;
  }

  function inlineRow(parent: HTMLElement): HTMLDivElement {
    const row = el(doc, 'div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:${C.warmGrey}`;
    parent.append(row);
    return row;
  }

  function block(parent: HTMLElement, className?: string): HTMLDivElement {
    const node = el(doc, 'div', className);
    node.style.cssText = 'display:grid;gap:7px';
    parent.append(node);
    return node;
  }

  /** The line that says which shafts the panel is about to change. */
  function pickedSummary(parent: HTMLElement): void {
    const rows = designerShaftRows(plan, classes, unitsNow()).filter((row) => pickedShafts.includes(row.key));
    const letters = rows.map((row) => row.label).join(' ');
    const line = el(
      doc,
      'div',
      'everyday-designer-picked',
      rows.length === 1 ? `Shaft ${letters}` : `Shafts ${letters}`,
    );
    line.style.cssText = `font-family:${TYPE.heading};font-size:18px;font-weight:700`;
    parent.append(line);
    const first = rows[0];
    if (rows.length === 1 && first !== undefined) {
      const detail = el(
        doc,
        'div',
        'everyday-designer-picked-detail',
        [first.reach, first.className, first.figure, ...first.marks].join(' · '),
      );
      detail.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey};line-height:1.5`;
      parent.append(detail);
    }
  }

  /* ------------------------------------------------------------ the drawing */

  /** A press in progress on the drawing: a shaft end being dragged. */
  let drag: { readonly key: string; readonly end: 'top' | 'bottom' } | undefined;
  let geometry: Geometry = geometryOf(plan, layoutOf(plan));
  let layout: TowerLayout = layoutOf(plan);

  function shaftAt(x: number, floor: number): PlanShaft | undefined {
    return plan.shafts.find((shaft) => {
      const column = layout.columnByShaft[shaft.key];
      if (column === undefined) return false;
      const left = geometry.left + column * geometry.bay;
      return x >= left && x < left + geometry.bay && floor >= shaft.bottom && floor <= shaft.top;
    });
  }

  function drawCanvas(): void {
    layout = layoutOf(plan);
    geometry = geometryOf(plan, layout);
    const g = geometry;
    const groupOf = groupIndexByShaft(plan);
    const svg = shape(doc, 'svg', {
      viewBox: `0 0 ${String(g.width)} ${String(g.height)}`,
      width: g.width,
      height: g.height,
      role: 'img',
      'aria-label': `${plan.name}: ${String(plan.floors)} floors above the lobby, ${String(plan.shafts.length)} shafts in ${String(groupsOf(plan).length)} groups. The chips above pick a shaft; the side panel changes it.`,
    });
    svg.setAttribute('class', 'everyday-designer-svg');
    svg.style.cssText = 'display:block;margin:0 auto;max-width:100%;height:auto;cursor:pointer';

    const groundY = yOf(g, 0) + g.floor;
    const bottomY = yOf(g, g.lowest) + g.floor;
    const right = g.left + layout.width * g.bay;
    const lineEvery = g.floor >= 8 ? 1 : 5;
    const floorsPicked =
      pickedFloors === undefined
        ? undefined
        : ([Math.min(...pickedFloors), Math.max(...pickedFloors)] as const);

    /* The blocks: the core and each wing, standing to its own height. */
    for (const structure of layout.structures) {
      const x = g.left + structure.x * g.bay;
      const w = structure.width * g.bay;
      const top = yOf(g, structure.top);
      svg.append(
        shape(doc, 'rect', { x, y: top, width: w, height: groundY - top, fill: C.card, stroke: C.ink, 'stroke-width': 1.3 }),
      );
      if (g.lowest < 0) {
        svg.append(
          shape(doc, 'rect', { x, y: groundY, width: w, height: bottomY - groundY, fill: C.paperDeeper, stroke: C.warmGrey, 'stroke-width': 1 }),
        );
      }
      /* The lobby, and any sky lobby this block stands high enough to have. */
      svg.append(shape(doc, 'rect', { x, y: yOf(g, 0), width: w, height: g.floor, fill: C.sun, 'fill-opacity': 0.28 }));
      for (const lobby of plan.skyLobbies) {
        if (lobby > structure.top) continue;
        svg.append(shape(doc, 'rect', { x, y: yOf(g, lobby), width: w, height: g.floor, fill: C.sky, 'fill-opacity': 0.3 }));
      }
      for (let floor = g.lowest + 1; floor <= structure.top; floor += 1) {
        if (floor % lineEvery !== 0 && floor !== 0 && floor !== 1) continue;
        const y = yOf(g, floor) + g.floor;
        svg.append(shape(doc, 'line', { x1: x, x2: x + w, y1: y, y2: y, stroke: C.ruleMid, 'stroke-width': 0.7 }));
      }
    }
    svg.append(
      shape(doc, 'line', { x1: g.left - 14, x2: right + 14, y1: groundY, y2: groundY, stroke: C.ink, 'stroke-width': 2 }),
    );

    if (floorsPicked !== undefined) {
      const top = yOf(g, floorsPicked[1]);
      svg.append(
        shape(doc, 'rect', {
          x: g.left - 4,
          y: top,
          width: right - g.left + 8,
          height: yOf(g, floorsPicked[0]) + g.floor - top,
          fill: C.ink,
          'fill-opacity': 0.1,
          stroke: C.ink,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3',
        }),
      );
    }

    /* Escalators and stairs: a rising stroke in the core's own margin, over the floors it joins. */
    const core = layout.structures.find((structure) => structure.side === 'core');
    const marginX = g.left + (core?.x ?? 0) * g.bay + g.bay * 0.12;
    for (const mode of plan.transportModes) {
      const low = Math.min(...mode.connects);
      const high = Math.max(...mode.connects);
      svg.append(
        shape(doc, 'line', {
          x1: marginX,
          y1: yOf(g, low) + g.floor - 1,
          x2: marginX + g.bay * 0.3,
          y2: yOf(g, high) + g.floor - 1,
          stroke: C.terracotta,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
    }

    /* The shafts. */
    plan.shafts.forEach((shaft, index) => {
      const column = layout.columnByShaft[shaft.key];
      if (column === undefined) return;
      const colour = GROUP_COLORS[(groupOf[index] ?? 0) % GROUP_COLORS.length] ?? C.sky;
      const gap = Math.max(2, g.bay * 0.14);
      const x = g.left + column * g.bay + gap;
      const w = g.bay - gap * 2;
      const top = yOf(g, shaft.top);
      const bottom = yOf(g, shaft.bottom) + g.floor;
      const on = pickedShafts.includes(shaft.key);
      svg.append(
        shape(doc, 'rect', { x, y: top, width: w, height: bottom - top, fill: C.paper, stroke: 'none' }),
        shape(doc, 'rect', { x, y: top, width: w, height: bottom - top, fill: colour, 'fill-opacity': 0.13, stroke: 'none' }),
        /* The run a car makes without opening its doors, drawn under the doors it does open. */
        shape(doc, 'line', {
          x1: x + w / 2,
          x2: x + w / 2,
          y1: top + 1,
          y2: bottom - 1,
          stroke: colour,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        }),
      );
      const inset = g.floor >= 10 ? 2 : 0.8;
      for (const stop of writtenStopsOf(plan, shaft)) {
        svg.append(
          shape(doc, 'rect', {
            x: x + 1.5,
            y: yOf(g, stop) + inset,
            width: w - 3,
            height: Math.max(1.5, g.floor - inset * 2),
            rx: 1,
            fill: colour,
            'fill-opacity': 0.82,
          }),
        );
      }
      /* The cars: one cabin, two stacked for a double deck, or one at each end for a pair. */
      const cabin = (floor: number, tall: boolean): void => {
        const height = (tall ? 2 : 1) * g.floor - 2;
        svg.append(
          shape(doc, 'rect', {
            x: x + 3,
            y: yOf(g, tall ? floor + 1 : floor) + 1,
            width: Math.max(2, w - 6),
            height: Math.max(2, height),
            fill: C.paper,
            stroke: C.ink,
            'stroke-width': 1.1,
          }),
        );
        if (tall) {
          const mid = yOf(g, floor);
          svg.append(shape(doc, 'line', { x1: x + 3, x2: x + w - 3, y1: mid, y2: mid, stroke: C.ink, 'stroke-width': 1.1 }));
        }
      };
      cabin(shaft.bottom, shaft.decks === 2);
      if (shaft.cars === 2) cabin(shaft.top, false);
      svg.append(
        shape(doc, 'rect', {
          x,
          y: top,
          width: w,
          height: bottom - top,
          fill: 'none',
          stroke: on ? C.ink : colour,
          'stroke-width': on ? 2.6 : 1.4,
        }),
      );
      /* The grips a picked shaft is dragged by, on the Shape step. */
      if (on && step === 'shape' && pickedShafts.length === 1) {
        for (const y of [top - 3, bottom - 3]) {
          svg.append(shape(doc, 'rect', { x: x - 2, y, width: w + 4, height: 6, rx: 3, fill: C.ink }));
        }
      }
      const letter = shape(doc, 'text', {
        x: x + w / 2,
        y: top - 7,
        'text-anchor': 'middle',
        'font-family': TYPE.mono,
        'font-size': Math.min(11, Math.max(8, g.bay * 0.42)),
        'font-weight': on ? 700 : 500,
        fill: on ? C.ink : C.warmGrey,
      });
      letter.textContent = shaftLabelOf(index);
      svg.append(letter);
    });

    /*
     * Floor names down the left: the ones that matter first — the lobby, the roof, the bottom, the
     * sky lobbies and whatever is picked — then as many of the rest as fit without touching one.
     */
    const every = [1, 2, 5, 10, 20, 50].find((n) => n * g.floor >= 13) ?? 50;
    const named = [...new Set<number>([...(floorsPicked ?? []), 0, g.highest, g.lowest, ...plan.skyLobbies])];
    const regular: number[] = [];
    for (let floor = g.lowest; floor <= g.highest; floor += 1) if (floor % every === 0) regular.push(floor);
    const taken: number[] = [];
    for (const [floors, strong] of [
      [named, true],
      [regular, false],
    ] as const) {
      for (const floor of floors) {
        const y = yOf(g, floor) + g.floor / 2 + 3.5;
        if (taken.some((other) => Math.abs(other - y) < 10.5)) continue;
        taken.push(y);
        const label = shape(doc, 'text', {
          x: g.left - 8,
          y,
          'text-anchor': 'end',
          'font-family': TYPE.mono,
          'font-size': 10,
          fill: strong ? C.ink : C.label,
        });
        label.textContent = planFloorId(plan, floor);
        svg.append(label);
      }
    }

    /* People, floor by floor, down the right: a bar as long as the floor is full. */
    let most = 1;
    for (let floor = g.lowest; floor <= g.highest; floor += 1) most = Math.max(most, planPopulationAt(plan, layout, floor));
    const barX = right + 14;
    const barMax = 54;
    const heading = shape(doc, 'text', { x: barX, y: g.top - 10, 'font-family': TYPE.mono, 'font-size': 9, fill: C.label });
    heading.textContent = 'PEOPLE';
    svg.append(heading);
    for (let floor = g.lowest; floor <= g.highest; floor += 1) {
      const people = planPopulationAt(plan, layout, floor);
      if (people <= 0) continue;
      svg.append(
        shape(doc, 'rect', {
          x: barX,
          y: yOf(g, floor) + (g.floor >= 8 ? 1.5 : 0.5),
          width: Math.max(1.5, (people / most) * barMax),
          height: Math.max(1.5, g.floor - (g.floor >= 8 ? 3 : 1)),
          fill: plan.populationByFloor[floor] === undefined ? C.moss : C.terracotta,
          'fill-opacity': 0.75,
        }),
      );
    }
    if (floorsPicked !== undefined && floorsPicked[0] === floorsPicked[1]) {
      const count = shape(doc, 'text', {
        x: barX + barMax + 6,
        y: yOf(g, floorsPicked[0]) + g.floor / 2 + 3.5,
        'font-family': TYPE.mono,
        'font-size': 10,
        fill: C.ink,
      });
      count.textContent = String(planPopulationAt(plan, layout, floorsPicked[0]));
      svg.append(count);
    }

    /* ------------------------------------------------------------- pointer */
    const pointOf = (event: PointerEvent): { x: number; floor: number } => {
      const box = svg.getBoundingClientRect();
      const scale = box.width === 0 ? 1 : g.width / box.width;
      const x = (event.clientX - box.left) * scale;
      const y = (event.clientY - box.top) * scale;
      const floor = g.highest - Math.floor((y - g.top) / g.floor);
      return { x, floor: Math.max(g.lowest, Math.min(g.highest, floor)) };
    };
    svg.addEventListener('pointerdown', (event) => {
      const at = pointOf(event);
      const hit = shaftAt(at.x, at.floor);
      if (step === 'floors') {
        pickedFloors =
          event.shiftKey && pickedFloors !== undefined ? [pickedFloors[0], at.floor] : [at.floor, at.floor];
        redraw();
        return;
      }
      if (hit === undefined) {
        pickedShafts = [];
        redraw();
        return;
      }
      const alone = pickedShafts.length === 1 && pickedShafts[0] === hit.key;
      if (alone && step === 'shape' && (at.floor === hit.top || at.floor === hit.bottom)) {
        drag = { key: hit.key, end: at.floor === hit.top ? 'top' : 'bottom' };
        return;
      }
      if (alone && step === 'service') {
        edit(withStopToggled(plan, hit.key, at.floor));
        return;
      }
      if (event.shiftKey) {
        pickedShafts = pickedShafts.includes(hit.key)
          ? pickedShafts.filter((key) => key !== hit.key)
          : [...pickedShafts, hit.key];
      } else {
        pickedShafts = [hit.key];
      }
      redraw();
    });
    canvasWrap.replaceChildren(svg);
  }

  /*
   * A drag is tracked on the document rather than on the drawing: the drawing is rebuilt on every
   * move, and a listener on a node that has been replaced hears nothing. The floor under the
   * pointer is read against the drawing that is on screen now.
   */
  function onPointerMove(event: PointerEvent): void {
    if (drag === undefined) return;
    const svg = canvasWrap.querySelector('svg');
    if (svg === null) return;
    const box = svg.getBoundingClientRect();
    const scale = box.width === 0 ? 1 : geometry.width / box.width;
    const y = (event.clientY - box.top) * scale;
    const floor = Math.max(
      geometry.lowest,
      Math.min(geometry.highest, geometry.highest - Math.floor((y - geometry.top) / geometry.floor)),
    );
    const held = drag;
    const current = plan.shafts.find((shaft) => shaft.key === held.key);
    if (current === undefined || current[held.end] === floor) return;
    plan = withShafts(plan, [held.key], (shaft) => ({ ...shaft, [held.end]: floor }));
    drawCanvas();
  }
  function onPointerUp(): void {
    if (drag === undefined) return;
    drag = undefined;
    redraw();
  }
  doc.addEventListener('pointermove', onPointerMove);
  doc.addEventListener('pointerup', onPointerUp);

  function drawChipBar(): void {
    chipBar.replaceChildren();
    for (const row of designerShaftRows(plan, classes, unitsNow())) {
      const on = pickedShafts.includes(row.key);
      const chip = el(doc, 'button', 'everyday-designer-shaft-chip', row.label);
      chip.type = 'button';
      chip.dataset['k'] = `shaft:${row.key}`;
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      chip.setAttribute('aria-label', `Shaft ${row.label}, ${[row.reach, row.className, ...row.marks].join(', ')}`);
      chip.title = [row.reach, row.className, row.figure, ...row.marks].join(' · ');
      chip.style.cssText = `cursor:pointer;min-width:30px;border:1.5px solid ${on ? C.ink : C.rule};background:${on ? C.ink : C.paper};color:${on ? C.paper : C.ink};border-radius:${String(R.control)}px;padding:4px 7px;font:600 11.5px ${TYPE.mono}`;
      chip.addEventListener('click', () => {
        pickedShafts = on ? pickedShafts.filter((key) => key !== row.key) : [...pickedShafts, row.key];
        if (step === 'floors') step = 'lifts';
        redraw();
      });
      chipBar.append(chip);
    }
    const tools = el(doc, 'span');
    tools.style.cssText = 'display:inline-flex;gap:5px;margin-left:auto;flex-wrap:wrap';
    button(tools, 'everyday-designer-pick-all', COPY.selectAll, 'pick-all', () => {
      pickedShafts = plan.shafts.map((shaft) => shaft.key);
      if (step === 'floors') step = 'lifts';
      redraw();
    });
    if (pickedShafts.length > 0) {
      button(tools, 'everyday-designer-pick-group', COPY.selectGroup, 'pick-group', () => {
        const groupOf = groupIndexByShaft(plan);
        const wanted = new Set(
          plan.shafts.flatMap((shaft, index) => (pickedShafts.includes(shaft.key) ? [groupOf[index] ?? 0] : [])),
        );
        pickedShafts = plan.shafts.filter((_, index) => wanted.has(groupOf[index] ?? 0)).map((shaft) => shaft.key);
        redraw();
      });
      button(tools, 'everyday-designer-pick-none', COPY.selectNone, 'pick-none', () => {
        pickedShafts = [];
        redraw();
      });
    }
    chipBar.append(tools);

    canvasHint.textContent =
      step === 'shape'
        ? COPY.dragHint
        : step === 'service'
          ? COPY.stopHint
          : step === 'floors'
            ? COPY.floorsNoSelection
            : COPY.liftsNoSelection;

    legend.replaceChildren();
    const key = (colour: string, text: string, opacity = 1): void => {
      const item = el(doc, 'span');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:5px';
      const swatch = el(doc, 'span');
      swatch.style.cssText = `width:12px;height:9px;border-radius:2px;background:${colour};opacity:${String(opacity)};flex:none`;
      item.append(swatch, el(doc, 'span', undefined, text));
      legend.append(item);
    };
    key(C.sun, COPY.legendLobby, 0.5);
    key(C.sky, COPY.legendSky, 0.55);
    key(GROUP_COLORS[0] ?? C.sky, COPY.legendStop, 0.85);
    key(C.terracotta, COPY.legendEscalator);
    key(C.moss, COPY.legendPeople, 0.75);
  }

  /* ------------------------------------------------------------- the steps */

  function drawTabs(): void {
    tabs.replaceChildren();
    for (const entry of DESIGNER_STEPS) {
      const on = entry.id === step;
      const tab = el(doc, 'button', 'everyday-designer-tab', entry.label);
      tab.type = 'button';
      tab.dataset['k'] = `tab:${entry.id}`;
      tab.dataset['step'] = entry.id;
      tab.setAttribute('aria-pressed', on ? 'true' : 'false');
      tab.title = entry.hint;
      tab.style.cssText = `cursor:pointer;border:1.5px solid ${on ? C.ink : C.rule};background:${on ? C.ink : C.card};color:${on ? C.paper : C.ink};border-radius:${String(R.row)}px;padding:8px 16px;font-family:${TYPE.heading};font-size:14px;font-weight:700`;
      tab.addEventListener('click', () => {
        step = entry.id;
        redraw();
      });
      tabs.append(tab);
    }
    const about = el(doc, 'span', 'everyday-designer-tab-hint', DESIGNER_STEPS.find((entry) => entry.id === step)?.hint ?? '');
    about.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-left:6px;flex:1 1 220px`;
    tabs.append(about);
  }

  function drawShapeStep(): void {
    const building = block(side, 'everyday-designer-building');
    building.style.gap = '13px';
    sectionLabel(building, 'THE BUILDING');
    chipRow(
      building,
      'everyday-designer-kind',
      'kind',
      Object.entries(DESIGNER_KIND_COPY).map(([value, label]) => ({ value, label })),
      plan.type,
      (kind) => {
        edit({
          ...plan,
          type: kind as TowerPlan['type'],
          trafficProfile: DESIGNER_PROFILE_BY_KIND[kind] ?? plan.trafficProfile,
        });
      },
      'ink',
    );
    sliderRow(building, 'Floors above the lobby', { min: 2, max: 160, step: 1 }, plan.floors, String, withFloors);
    sliderRow(building, 'Floors below the lobby', { min: 0, max: 6, step: 1 }, plan.belowLobby.length, String, withBasements);
    sliderRow(
      building,
      'Floor to floor',
      { min: 2.6, max: 6, step: 0.1 },
      plan.floorHeightM,
      (value) => lengthFigure(value, unitsNow()),
      (current, next) => ({ ...current, floorHeightM: Math.round(next * 10) / 10 }),
    );
    sliderRow(
      building,
      'People a shaft bay',
      { min: 1, max: 80, step: 1 },
      plan.peoplePerBay,
      String,
      (current, next) => ({ ...current, peoplePerBay: next }),
    );
    sliderRow(
      building,
      'Occupied share',
      { min: 0, max: 120, step: 1 },
      plan.occupancyPct,
      (value) => `${String(value)}%`,
      (current, next) => ({ ...current, occupancyPct: next }),
    );

    const shafts = block(side, 'everyday-designer-shafts');
    sectionLabel(shafts, 'SHAFTS');
    hint(shafts, COPY.massingHint, 'everyday-designer-massing');
    const add = inlineRow(shafts);
    button(add, 'everyday-designer-add-full', COPY.addFullShaft, 'add-full', () => {
      const bottom = picked()[0]?.bottom ?? 0;
      plan = withShaftAdded(plan, bottom, plan.floors);
      pickedShafts = [plan.shafts.at(-1)?.key ?? ''];
      redraw();
    });
    button(add, 'everyday-designer-add-short', COPY.addShortShaft, 'add-short', () => {
      /* As tall as the shortest shaft already drawn, or half the tower: a wing of one joins a wing. */
      const lowestTop = plan.shafts.reduce((best, shaft) => Math.min(best, shaft.top), plan.floors);
      const top = lowestTop < plan.floors ? lowestTop : Math.max(1, Math.round(plan.floors / 2));
      plan = withShaftAdded(plan, 0, top);
      pickedShafts = [plan.shafts.at(-1)?.key ?? ''];
      redraw();
    });

    const chosen = picked();
    if (chosen.length === 0) {
      hint(shafts, COPY.shapeNoSelection);
      return;
    }
    pickedSummary(shafts);
    const first = chosen[0] as PlanShaft;
    const keys = chosen.map((shaft) => shaft.key);
    const reach = inlineRow(shafts);
    reach.append(el(doc, 'span', undefined, 'reaches from floor'));
    numberField(reach, 'Lowest floor the shaft reaches', first.bottom, (next) => {
      edit(withShafts(plan, keys, (shaft) => ({ ...shaft, bottom: next })));
    });
    reach.append(el(doc, 'span', undefined, 'up to floor'));
    numberField(reach, 'Highest floor the shaft reaches', first.top, (next) => {
      edit(withShafts(plan, keys, (shaft) => ({ ...shaft, top: next })));
    });
    const travel = el(
      doc,
      'div',
      'everyday-designer-travel',
      `${planFloorId(plan, first.bottom)} to ${planFloorId(plan, first.top)} · ${lengthFigure(shaftRiseM(plan, first), unitsNow())} of travel · the lobby is floor 0 here, and a floor below it is negative`,
    );
    travel.style.cssText = `font:500 11px ${TYPE.mono};color:${C.faint};line-height:1.5`;
    shafts.append(travel);
    const quick = inlineRow(shafts);
    button(quick, 'everyday-designer-to-roof', 'To the roof', 'to-roof', () => {
      edit(withShafts(plan, keys, (shaft) => ({ ...shaft, top: plan.floors })));
    });
    button(quick, 'everyday-designer-copy', COPY.copyShaft, 'copy', () => {
      edit(keys.reduce((current, key) => withShaftCopied(current, key), plan));
    });
    button(quick, 'everyday-designer-remove', COPY.removeShaft, 'remove', () => {
      edit(withShaftsRemoved(plan, keys));
    });
    /* Only a shaft that stops below the roof is in a wing; the core is one structure. */
    const roof = plan.shafts.reduce((best, shaft) => Math.max(best, shaft.top), 0);
    if (chosen.every((shaft) => shaft.top < roof)) {
      const apart = chosen.every((shaft) => (shaft.wing ?? 0) !== 0);
      const wingRow = inlineRow(shafts);
      button(wingRow, 'everyday-designer-wing', apart ? COPY.wingRejoin : COPY.wingApart, 'wing', () => {
        edit(withWing(plan, keys, apart ? 0 : 1));
      });
      hint(shafts, COPY.wingHint);
    }
  }

  function drawLiftsStep(): void {
    const chosen = picked();
    const machines = block(side, 'everyday-designer-machines');
    sectionLabel(machines, 'MACHINE');
    if (chosen.length === 0) {
      hint(machines, COPY.liftsNoSelection);
    } else {
      pickedSummary(machines);
      const first = chosen[0] as PlanShaft;
      const keys = chosen.map((shaft) => shaft.key);
      const shared = <T>(read: (shaft: PlanShaft) => T): T | undefined =>
        chosen.every((shaft) => read(shaft) === read(first)) ? read(first) : undefined;
      const machineClass: MachineClass | undefined = classOfMachine(classes, first.machine);

      chipRow(
        machines,
        'everyday-designer-class',
        'class',
        classes.map((entry) => ({ value: entry.id, label: entry.name, title: entry.application })),
        shared((shaft) => shaft.machine.specClass),
        (id) => {
          const wanted = classes.find((entry) => entry.id === id);
          if (wanted !== undefined) edit(withPlanMachineClass(plan, keys, wanted));
        },
        'ink',
      );
      if (machineClass !== undefined) {
        const limits = el(
          doc,
          'div',
          'everyday-designer-limits',
          `${speedRangeFigure(machineClass.speedMinMps, machineClass.speedMaxMps, unitsNow())} · up to ${String(machineClass.maxFloors)} floors and ${lengthFigure(machineClass.maxRiseM, unitsNow(), 0)} of rise`,
        );
        limits.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey}`;
        const application = el(doc, 'div', undefined, machineClass.application);
        application.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45`;
        machines.append(limits, application);

        fieldName(machines, 'Rated speed');
        chipRow(
          machines,
          'everyday-designer-step',
          'speed',
          /*
           * The **label** is converted and the value written is not — § 13's *convert, not relabel*
           * pointed at a control. A reader picking `8.20 ft/s` writes `2.5` to `ratedSpeedMps`.
           */
          speedStepsFor(machineClass).map((value) => ({ value, label: speedFigure(value, unitsNow()) })),
          shared((shaft) => shaft.machine.ratedSpeedMps),
          (next) => {
            edit(withPlanMachineStep(plan, keys, { ratedSpeedMps: next }));
          },
        );
        fieldName(machines, 'Rated load');
        chipRow(
          machines,
          'everyday-designer-step',
          'load',
          loadStepsFor(machineClass).map((value) => ({ value, label: `${String(value)} lb` })),
          shared((shaft) => shaft.machine.ratedLoadLb),
          (next) => {
            edit(withPlanMachineStep(plan, keys, { ratedLoadLb: next }));
          },
        );
        hint(machines, COPY.machineStepsHint);

        /*
         * The class § 10.1's automatic choice would have picked for a shaft this tall, offered
         * rather than applied. Applying it silently would move a class the reader chose.
         */
        const automatic = automaticClassFor(classes, shaftRiseM(plan, first), first.top - first.bottom);
        if (automatic !== undefined && automatic.id !== first.machine.specClass) {
          const suggest = button(
            machines,
            'everyday-designer-auto-class',
            `A shaft this tall is ordinarily built with ${automatic.name} — use it`,
            'auto-class',
            () => {
              edit(withPlanMachineClass(plan, keys, automatic));
            },
          );
          suggest.style.borderRadius = `${String(R.control)}px`;
          suggest.style.textAlign = 'left';
        }
      }

      const car = block(side, 'everyday-designer-car');
      sectionLabel(car, 'THE CAR');
      fieldName(car, COPY.decksLabel);
      chipRow(
        car,
        'everyday-designer-decks',
        'decks',
        [
          { value: 1, label: 'Single' },
          { value: 2, label: 'Double-deck' },
        ],
        shared((shaft) => shaft.decks),
        (next) => {
          edit(withDecks(plan, keys, next === 2 ? 2 : 1));
        },
      );
      hint(car, COPY.decksHint);
      fieldName(car, COPY.carsLabel);
      chipRow(
        car,
        'everyday-designer-cars',
        'cars',
        [
          { value: 1, label: 'One' },
          { value: 2, label: 'Two, one above the other' },
        ],
        shared((shaft) => shaft.cars),
        (next) => {
          edit(withCars(plan, keys, next === 2 ? 2 : 1));
        },
      );
      hint(car, COPY.carsHint);
      fieldName(car, COPY.dutyLabel);
      chipRow(
        car,
        'everyday-designer-duty',
        'duty',
        PLAN_DUTIES.map((value) => ({ value, label: DESIGNER_DUTY_COPY[value] })),
        shared((shaft) => shaft.duty),
        (next) => {
          edit(withShafts(plan, keys, (shaft) => ({ ...shaft, duty: next })));
        },
      );
      fieldName(car, COPY.pressureLabel);
      chipRow(
        car,
        'everyday-designer-pressure',
        'pressure',
        [
          { value: 'open', label: 'Ordinary' },
          { value: 'held', label: 'Holds its pressure' },
        ],
        shared((shaft) => (shaft.pressurised ? 'held' : 'open')),
        (next) => {
          edit(withShafts(plan, keys, (shaft) => ({ ...shaft, pressurised: next === 'held' })));
        },
      );
      hint(car, COPY.pressureHint);
    }

    const wide = block(side, 'everyday-designer-equipment');
    sectionLabel(wide, 'THE WHOLE BUILDING');
    const ropes = specs.ropeClasses?.classes ?? [];
    if (ropes.length > 0) {
      fieldName(wide, COPY.ropeLabel);
      chipRow(
        wide,
        'everyday-designer-rope',
        'rope',
        [
          { value: '', label: COPY.ropeUnmodelled },
          ...ropes.map((rope) => ({ value: rope.id, label: rope.name, title: rope.application })),
        ],
        plan.ropeClass ?? '',
        (next) => {
          const { ropeClass: _dropped, ...rest } = plan;
          void _dropped;
          edit(next === '' ? rest : { ...rest, ropeClass: next });
        },
      );
    }
    fieldName(wide, COPY.driveLabel);
    chipRow(
      wide,
      'everyday-designer-drive',
      'drive',
      [
        { value: 'plain', label: 'Ordinary' },
        { value: 'regen', label: 'Give energy back on the way down' },
      ],
      plan.regenerativeDrive ? 'regen' : 'plain',
      (next) => {
        edit({ ...plan, regenerativeDrive: next === 'regen' });
      },
    );
  }

  function drawFloorsStep(): void {
    const panel = block(side, 'everyday-designer-floors');
    panel.style.gap = '10px';
    sectionLabel(panel, 'FLOORS');
    const lowest = planLowestFloor(plan);
    const range = pickedFloors ?? ([1, 1] as const);
    const pick = inlineRow(panel);
    pick.append(el(doc, 'span', undefined, 'from floor'));
    numberField(pick, 'First floor picked', Math.min(...range), (next) => {
      const floor = Math.max(lowest, Math.min(plan.floors, next));
      /* With nothing picked yet the field names one floor, not a range down from the default. */
      pickedFloors = pickedFloors === undefined ? [floor, floor] : [floor, Math.max(floor, Math.max(...range))];
      redraw();
    });
    pick.append(el(doc, 'span', undefined, 'to floor'));
    numberField(pick, 'Last floor picked', Math.max(...range), (next) => {
      const floor = Math.max(lowest, Math.min(plan.floors, next));
      pickedFloors = pickedFloors === undefined ? [floor, floor] : [Math.min(floor, Math.min(...range)), floor];
      redraw();
    });
    if (pickedFloors === undefined) {
      hint(panel, COPY.floorsNoSelection);
      return;
    }
    const low = Math.min(...pickedFloors);
    const high = Math.max(...pickedFloors);
    const floors: number[] = [];
    for (let floor = low; floor <= high; floor += 1) floors.push(floor);
    const facts = designerFloorFacts(plan, pickedFloors);
    const heading = el(doc, 'div', 'everyday-designer-floor-title', facts.title);
    heading.style.cssText = `font-family:${TYPE.heading};font-size:18px;font-weight:700`;
    panel.append(heading);

    if (facts.canBeSkyLobby) {
      fieldName(panel, COPY.skyLobbyLabel);
      chipRow(
        panel,
        'everyday-designer-sky',
        'sky',
        [
          { value: 'no', label: 'An ordinary floor' },
          { value: 'yes', label: 'A sky lobby' },
        ],
        facts.skyLobby ? 'yes' : 'no',
        (next) => {
          if ((next === 'yes') !== facts.skyLobby) edit(withSkyLobbyToggled(plan, floors));
        },
      );
      hint(panel, COPY.skyLobbyHint);
    }

    fieldName(panel, COPY.peopleLabel);
    const people = inlineRow(panel);
    numberField(
      people,
      floors.length === 1 ? 'People on this floor' : 'People on each of these floors',
      floors.length === 1 ? facts.people : Math.round(facts.people / floors.length),
      (next) => {
        edit(withPopulation(plan, floors, next));
      },
    );
    const note = el(
      doc,
      'span',
      'everyday-designer-people-note',
      floors.length === 1 ? facts.peopleNote : `${String(facts.people)} in all · ${facts.peopleNote}`,
    );
    people.append(note);
    if (floors.some((floor) => plan.populationByFloor[floor] !== undefined)) {
      const follow = button(panel, 'everyday-designer-people-follow', COPY.peopleFollow, 'people-follow', () => {
        edit(withPopulation(plan, floors, undefined));
      });
      follow.style.justifySelf = 'start';
    }

    const uses = [...new Set(Object.values(DESIGNER_PROFILE_BY_KIND))].flatMap((id) => {
      const profile = context.host.trafficProfileById(id);
      return profile === undefined ? [] : [{ value: id, label: profile.name }];
    });
    if (uses.length > 1 && floors.some((floor) => floor > 0)) {
      fieldName(panel, COPY.useLabel);
      chipRow(panel, 'everyday-designer-use', 'use', uses, facts.use, (next) => {
        edit(withUse(plan, floors, next));
      });
    }

    if (facts.canHaveEscalator) {
      fieldName(panel, COPY.escalatorLabel);
      chipRow(
        panel,
        'everyday-designer-escalator',
        'escalator',
        [
          { value: 'no', label: 'None' },
          { value: 'yes', label: 'An escalator' },
        ],
        facts.escalator ? 'yes' : 'no',
        (next) => {
          if ((next === 'yes') !== facts.escalator) edit(withEscalatorToggled(plan, low));
        },
      );
      hint(panel, COPY.escalatorHint);
    }
    void autoPopulationAt;
  }

  function drawServiceStep(): void {
    const panel = block(side, 'everyday-designer-service');
    panel.style.gap = '10px';
    sectionLabel(panel, 'WHERE THE DOORS OPEN');
    const chosen = picked();
    if (chosen.length === 0) {
      hint(panel, COPY.serviceNoSelection);
    } else {
      pickedSummary(panel);
      const first = chosen[0] as PlanShaft;
      const keys = chosen.map((shaft) => shaft.key);
      const kind = chosen.every((shaft) => shaft.service === first.service) ? first.service : undefined;
      chipRow(
        panel,
        'everyday-designer-pattern',
        'pattern',
        PLAN_SERVICE_KINDS.map((value) => ({
          value,
          label: DESIGNER_SERVICE_COPY[value].name,
          title: DESIGNER_SERVICE_COPY[value].blurb,
        })),
        kind,
        (next) => {
          edit(
            withShafts(plan, keys, (shaft) =>
              next === 'custom'
                ? { ...shaft, service: 'custom', stops: [...writtenStopsOf(plan, shaft)] }
                : { ...shaft, service: next },
            ),
          );
        },
        'ink',
      );
      if (kind !== undefined) hint(panel, DESIGNER_SERVICE_COPY[kind].blurb, 'everyday-designer-pattern-blurb');
      if (kind === 'express') {
        const zone = inlineRow(panel);
        zone.append(el(doc, 'span', undefined, COPY.zoneLabel));
        numberField(zone, COPY.zoneLabel, first.zoneLow, (next) => {
          edit(withShafts(plan, keys, (shaft) => ({ ...shaft, zoneLow: next })));
        });
      }
      for (const shaft of chosen.slice(0, 4)) {
        const line = el(
          doc,
          'div',
          'everyday-designer-service-line',
          `${shaftLabelOf(plan.shafts.indexOf(shaft))}: ${designerServiceLine(plan, shaft)}`,
        );
        line.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.inkSoft};line-height:1.5`;
        panel.append(line);
      }
      hint(panel, COPY.stopHint);
    }

    const zones = block(side, 'everyday-designer-zones');
    sectionLabel(zones, 'A SHORTCUT');
    fieldName(zones, COPY.autoZoneLabel);
    chipRow(
      zones,
      'everyday-designer-autozone',
      'autozone',
      [2, 3, 4].map((value) => ({ value, label: `${String(value)} zones` })),
      undefined,
      (count) => {
        edit(withAutoZones(plan, count));
      },
    );
    hint(zones, COPY.autoZoneHint);
    /* Service zoning is not access zoning, and the board that sets one does not set the other. */
    hint(zones, COPY.serviceScopeHint, 'everyday-designer-service-scope');
  }

  function drawSide(): void {
    side.replaceChildren();
    if (step === 'shape') drawShapeStep();
    else if (step === 'lifts') drawLiftsStep();
    else if (step === 'floors') drawFloorsStep();
    else drawServiceStep();
  }

  /* -------------------------------------------------- under the drawing */

  function drawGroups(): void {
    groupsCard.replaceChildren();
    const heading = el(doc, 'div', undefined, COPY.groupsEyebrow);
    heading.style.cssText = `${EYEBROW};margin-bottom:10px`;
    groupsCard.append(heading);
    hint(groupsCard, COPY.groupsHint, 'everyday-designer-groups-hint');
    const rows = el(doc, 'div');
    rows.style.cssText = 'display:grid;gap:7px;margin-top:10px';
    groupsCard.append(rows);
    const groups = groupsOf(plan);
    for (const row of designerGroupRows(plan, analysis)) {
      const line = el(doc, 'button', 'everyday-designer-group');
      line.type = 'button';
      line.dataset['k'] = `group:${String(row.index)}`;
      line.style.cssText = `cursor:pointer;text-align:left;display:grid;grid-template-columns:14px minmax(70px,auto) 1fr;gap:4px 10px;align-items:baseline;padding:8px 11px;border:1px solid ${C.ruleLight};border-radius:${String(R.row)}px;background:${C.paper};color:${C.ink};font:inherit`;
      const swatch = el(doc, 'span');
      swatch.style.cssText = `width:12px;height:12px;border-radius:3px;background:${GROUP_COLORS[row.index % GROUP_COLORS.length] ?? C.sky};align-self:center`;
      const name = el(doc, 'span', 'everyday-designer-group-name', `${row.name} · ${row.shafts}`);
      name.style.cssText = 'font-size:13px;font-weight:700';
      const what = el(doc, 'span', 'everyday-designer-group-pattern', `${row.pattern} · ${row.stops}`);
      what.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.inkSoft};line-height:1.5`;
      const figure = el(doc, 'span', 'everyday-designer-group-figure', row.figure);
      figure.style.cssText = `grid-column:2 / -1;font:500 11.5px ${TYPE.mono};color:${row.withheld ? C.warmGrey : C.moss};line-height:1.5`;
      line.append(swatch, name, what, figure);
      line.addEventListener('click', () => {
        pickedShafts = (groups[row.index]?.shafts ?? []).map((index) => plan.shafts[index]?.key ?? '');
        if (step === 'floors') step = 'service';
        redraw();
      });
      rows.append(line);
    }
  }

  /*
   * § 13.3's *document*: a collapsed disclosure that prints the design as an engineer would write
   * it — GitHub issue #177 item 5, § D518. `<details>` rather than a hand-rolled toggle: the fold's
   * state is the element's own and a keyboard reaches it. Collapsed by default, as the guide draws it.
   */
  function drawSpecBlock(): void {
    specBlock.replaceChildren();
    const heading = el(doc, 'div', undefined, COPY.specEyebrow);
    heading.style.cssText = `${EYEBROW};margin-bottom:8px`;
    const note = el(doc, 'p', 'everyday-designer-spec-note', COPY.specNote);
    note.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;margin:0 0 13px;max-width:80ch`;
    const fold = el(doc, 'details', 'everyday-designer-document');
    fold.open = documentOpen;
    fold.addEventListener('toggle', () => {
      documentOpen = fold.open;
    });
    const summary = el(doc, 'summary', 'everyday-designer-document-summary', COPY.documentFold);
    summary.style.cssText = `cursor:pointer;font-size:12.5px;font-weight:600;color:${C.ink};margin-bottom:10px`;
    fold.append(summary);
    specBlock.append(heading, note, fold);

    /* The plate is one lift's: the first shaft picked, or the first drawn. */
    const plated = picked()[0] ?? plan.shafts[0];
    if (plated !== undefined) {
      const label = el(
        doc,
        'div',
        'everyday-designer-plate-label',
        `${COPY.plateEyebrow} — SHAFT ${shaftLabelOf(plan.shafts.indexOf(plated))}`,
      );
      label.style.cssText = `${EYEBROW};font-size:9.5px;margin-bottom:6px`;
      const plate = el(doc, 'div', 'everyday-designer-plate');
      plate.style.cssText = PLATE_STYLE;
      const plateGrid = el(doc, 'div');
      plateGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px 14px';
      for (const row of designerPlateRows(plan, plated, classOfMachine(classes, plated.machine), unitsNow())) {
        const cell = el(doc, 'div');
        const key = el(doc, 'div', undefined, row.key);
        key.style.cssText = `font:500 9px ${TYPE.mono};letter-spacing:.16em;color:#5A554C`;
        const value = el(doc, 'div', undefined, row.value);
        value.style.cssText = `font:600 15px ${TYPE.mono};letter-spacing:-.02em;color:#2E2A24;margin-top:1px`;
        cell.append(key, value);
        plateGrid.append(cell);
      }
      plate.append(plateGrid);
      fold.append(label, plate);
    }

    const capacity = el(doc, 'div', 'everyday-designer-capacity', designerCapacityLine(plan));
    capacity.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.moss};margin-top:10px;line-height:1.5`;
    fold.append(capacity);

    const reading = designerReading(analysis);
    if (reading !== '') {
      const readingNode = el(doc, 'div', 'everyday-designer-reading', reading);
      readingNode.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:4px;line-height:1.5;max-width:80ch`;
      fold.append(readingNode);
    }
    for (const refusal of analysis.refusals) {
      const line = el(doc, 'div', 'everyday-designer-refusal', refusal);
      line.style.cssText = `font-size:12.5px;color:${C.alarm};margin-top:9px;line-height:1.5`;
      fold.append(line);
    }
    for (const bank of analysis.banks) {
      const line = el(doc, 'div', 'everyday-designer-bank', bank.refusal !== '' ? bank.refusal : bank.line);
      line.style.cssText = `font:500 11.5px ${TYPE.mono};color:${bank.refusal !== '' ? C.alarm : C.inkSoft};margin-top:7px;line-height:1.55`;
      fold.append(line);
      for (const warning of bank.warnings) {
        const warn = el(doc, 'div', 'everyday-designer-bank-warning', warning);
        warn.style.cssText = `font-size:12px;color:${C.terracotta};margin-top:3px;line-height:1.5;max-width:86ch`;
        fold.append(warn);
      }
    }
    /* What the loader said about a building it did build, in its own words. */
    for (const advisory of analysis.advisories) {
      const line = el(doc, 'div', 'everyday-designer-advisory', advisory);
      line.style.cssText = `font-size:12px;color:${C.warmGrey};margin-top:7px;line-height:1.5;max-width:86ch`;
      fold.append(line);
    }
    const notScored = el(doc, 'div', 'everyday-designer-not-scored', COPY.notScored);
    notScored.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:12px;font-style:italic`;
    fold.append(notScored);
  }

  function drawFigures(): void {
    figureRow.replaceChildren();
    for (const figure of designerFigures(plan, analysis, unitsNow())) {
      const cell = el(doc, 'div', 'everyday-designer-figure');
      cell.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.tile)}px;background:${C.card};padding:12px 14px`;
      const value = el(doc, 'div', 'everyday-designer-figure-value', figure.value);
      value.style.cssText = `font:500 20px ${TYPE.mono};color:${figure.withheld ? C.warmGrey : C.ink};letter-spacing:-.02em`;
      const label = el(doc, 'div', undefined, figure.label);
      label.style.cssText = 'font-size:12.5px;font-weight:600;margin-top:4px';
      const note = el(doc, 'div', 'everyday-designer-figure-note', figure.note);
      note.style.cssText = `font-size:11.5px;color:${C.warmGrey};line-height:1.4;margin-top:2px`;
      cell.append(value, label, note);
      figureRow.append(cell);
    }
  }

  function drawWarnings(): void {
    lossNote.textContent = lossLine;
    lossNote.hidden = lossLine === '';

    const warnings = designerWarnings(plan, classes, analysis, unitsNow());
    warningCard.replaceChildren();
    warningCard.hidden = warnings.length === 0;
    if (warnings.length > 0) {
      const heading = el(doc, 'div', undefined, COPY.checkEyebrow);
      heading.style.cssText = `${EYEBROW};margin-bottom:6px`;
      warningCard.append(heading);
    }
    warnings.forEach((warning, index) => {
      const line = el(doc, 'div', `everyday-designer-warning-${warning.severity}`);
      line.style.cssText = `color:${warning.severity === 'comfort' ? C.inkSoft : C.alarm};margin-top:${index === 0 ? '0' : '6px'}`;
      line.append(el(doc, 'span', undefined, warning.text));
      const fix = warning.fix;
      if (fix !== undefined) {
        const press = button(line, 'everyday-designer-fix', fix.label, `fix:${String(index)}`, () => {
          edit(fix.apply(plan));
        });
        press.style.marginLeft = '9px';
        press.style.borderColor = C.ink;
      }
      warningCard.append(line);
    });
  }

  /**
   * Re-derive everything from the plan. The control that had the keyboard keeps it: every control
   * carries a key, and whichever one was focused before the panels were rebuilt is focused after.
   */
  function redraw(keepSide = false): void {
    const active = doc.activeElement;
    const focusKey = active instanceof HTMLElement && root.contains(active) ? active.dataset['k'] : undefined;
    analysis = planAnalysisOf(plan, specs);
    drawFigures();
    drawWarnings();
    drawTabs();
    drawChipBar();
    drawCanvas();
    if (!keepSide) drawSide();
    drawGroups();
    drawSpecBlock();
    savedNote.textContent = savedLine;
    if (focusKey !== undefined && !keepSide) {
      for (const candidate of root.querySelectorAll<HTMLElement>('[data-k]')) {
        if (candidate.dataset['k'] === focusKey) {
          candidate.focus({ preventScroll: true });
          break;
        }
      }
    }
  }

  function applyAndReport(): string | undefined {
    try {
      const id = context.host.applyTowerPlan(plan);
      savedLine = `Saved as ${id}. The next run stands on it.`;
      return id;
    } catch (error) {
      /* The loader's own refusal, quoted. */
      savedLine = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  }

  nameInput.addEventListener('input', () => {
    plan = { ...plan, name: nameInput.value };
  });
  saveButton.addEventListener('click', () => {
    applyAndReport();
    savedNote.textContent = savedLine;
  });

  redraw();
  host.append(root);

  return {
    /* The drag listeners are on the document, so they are the one thing this screen must take back. */
    unmount: () => {
      designerHost = undefined;
      doc.removeEventListener('pointermove', onPointerMove);
      doc.removeEventListener('pointerup', onPointerUp);
    },
    /*
     * § 3.3's primary — *Run a day in it*, as a **sandbox day** (wave AO, § D1368): the drawn tower
     * is saved and run over the week and never on it, which is `host.runSandbox`'s whole contract.
     * A plan the loader refuses, or a day a scored attempt holds, throws; the sentence is drawn
     * where the reader is and nothing is written.
     */
    primary: () => {
      try {
        context.host.runSandbox({ building: undefined, plan, pattern: undefined, dwell: undefined });
      } catch (error) {
        savedLine = error instanceof Error ? error.message : String(error);
        savedNote.textContent = savedLine;
        return;
      }
      context.go('stage');
    },
  };
}

/**
 * § 3.3's row, with the primary drawn inert while a scored attempt stands on the week on screen —
 * § D1360's sentence, as the reason the button carries, rather than a live button that refuses.
 */
function designerBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  const held = designerHost?.attemptHold();
  return held === undefined ? base : { ...base, primary: { ...base.primary, inert: held } };
}

/** The registry row — GAMEPLAY § 13's screen. */
export const DESIGNER_SCREEN: EverydayScreenModule = {
  key: 'designer',
  mount,
  bar: designerBar,
};
