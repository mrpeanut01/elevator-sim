/**
 * **The DOM half of § D1000's five families**, shared by both fix-it surfaces.
 *
 * Everything a player reads here is `fixitScreenModel.ts`'s (`fixitDialGroupsView`,
 * `fixitDoorView`, `fixitRezoneView`, `FIXIT_SCREEN_COPY`), and every decision — which dials are
 * live, what a select offers, what a press costs, whether the order can run — is `fixit/`'s. This
 * file builds selects and chips and forwards presses, which is the same division `fixitScreen.ts`
 * keeps with its own model.
 *
 * **One mount for two surfaces**, because the alternative is the Everyday screen and the Engineer
 * panel each holding a copy of a thirty-dial editor, and the day one of them drew a dial the other
 * did not, the two surfaces would disagree about what the player can change on the same case. They
 * differ on palette, which each passes in — `fixitScreen.ts`'s docstring says why that difference is
 * correct.
 */

import { editorInputsOf, withPrunedDials } from '../fixit/editorInputs.js';
import {
  setCarBank,
  setDial,
  setDoorDwell,
  setTenancyPosition,
  toggleBankFloor,
  togglePlate,
} from '../fixit/engine.js';
import { fixitPlanRefusalOf, type FixitResources } from '../fixit/run.js';
import { EVERY_CAR, type FixitCase, type FixitState } from '../fixit/types.js';
import type { PriceSchedule } from '../pricing/types.js';
import type { TelemetryControlKey } from '../telemetry/schema.js';
import {
  FIXIT_SCREEN_COPY as COPY,
  decodeFamilyValue,
  fixitDialGroupsView,
  fixitDoorView,
  fixitRezoneView,
  fixitTenancyView,
  type FixitGroupHeader,
  type FixitSelectOption,
} from './fixitScreenModel.js';

/** The surface's own colours and radii — each surface reads its own product's tokens. */
export interface FixitFamiliesPalette {
  readonly ink: string;
  readonly soft: string;
  readonly faint: string;
  readonly rule: string;
  readonly paper: string;
  readonly label: string;
  readonly alarm: string;
  readonly accent: string;
  readonly radius: number;
  readonly mono: string;
}

export interface FixitFamiliesDeps {
  readonly doc: Document;
  readonly entry: FixitCase;
  readonly state: FixitState;
  readonly resources: FixitResources;
  readonly schedule: PriceSchedule;
  /** A run is in flight; every control is held. */
  readonly running: boolean;
  /** Which door-hold target the selects edit — view state, held by the surface across redraws. */
  readonly doorTarget: string;
  readonly setDoorTarget: (target: string) => void;
  /** Commit a new order and redraw. The surface records the telemetry beat under `key`. */
  readonly commit: (next: FixitState, key: TelemetryControlKey) => void;
  readonly palette: FixitFamiliesPalette;
  /** Class prefix, so each surface's browser tier addresses its own nodes. */
  readonly prefix: string;
}

/** The three sections, and the line that says the order cannot run as drawn when it cannot. */
export function mountFixitFamilies(deps: FixitFamiliesDeps): HTMLElement {
  const { doc, entry, state, resources, schedule, palette: P, prefix } = deps;
  const root = doc.createElement('div');
  root.className = `${prefix}-families`;
  root.style.cssText = 'display:grid;gap:14px';

  const inputs = editorInputsOf(entry, state, resources, schedule);
  const press = (next: FixitState, key: TelemetryControlKey): void => {
    if (deps.running) return;
    deps.commit(withPrunedDials(entry, next, resources), key);
  };

  const refusal = fixitPlanRefusalOf(entry, state, resources);
  if (refusal !== undefined) {
    const line = text('div', `${prefix}-families-refused`, COPY.planRefused);
    line.style.cssText = `font-size:12.5px;line-height:1.5;color:${P.alarm}`;
    line.title = refusal;
    root.append(line);
  }

  /* ---- the dials ---- */
  const dialsBlock = section(COPY.dialsEyebrow, COPY.dialsHint);
  for (const group of fixitDialGroupsView(inputs.dialGroups)) {
    const block = doc.createElement('div');
    block.className = `${prefix}-dial-group ${prefix}-dial-group-${group.key}`;
    block.append(header(group.header));
    for (const dial of group.dials) {
      const row = line(`${prefix}-dial ${prefix}-dial-${dial.key.replace(/\./g, '-')}`);
      const select = selectOf(dial.options, dial.label, group.header.atBudget);
      select.addEventListener('change', () => {
        press(setDial(entry, state, dial.key, decodeFamilyValue(select.value), schedule), 'fixit-dial');
      });
      const label = text('span', undefined, dial.label);
      label.style.cssText = 'font-size:13px;font-weight:600';
      label.title = dial.effect;
      row.append(select, label);
      block.append(row);
    }
    dialsBlock.append(block);
  }
  root.append(dialsBlock);

  /* ---- the door hold ---- */
  const door = fixitDoorView(inputs.door, state.doorDwell, deps.doorTarget);
  const doorBlock = doc.createElement('div');
  doorBlock.className = `${prefix}-door`;
  doorBlock.append(header(door.header));
  const doorRow = line(`${prefix}-door-row`);
  const doorLabel = text('span', undefined, door.label);
  doorLabel.style.cssText = 'font-size:13px;font-weight:600';
  const target = selectOf(door.targets, `${door.label} — ${door.targetLabel}`, false);
  target.className = `${prefix}-door-target`;
  target.addEventListener('change', () => deps.setDoorTarget(target.value));
  doorRow.append(doorLabel, text('span', undefined, door.targetLabel), target);
  doorBlock.append(doorRow);
  for (const side of door.sides) {
    const row = line(`${prefix}-door-side ${prefix}-door-${side.key}`);
    const select = selectOf(side.options, `${door.label} — ${side.label}`, door.header.atBudget);
    select.addEventListener('change', () => {
      const value = decodeFamilyValue(select.value);
      press(
        setDoorDwell(entry, state, deps.doorTarget, side.key, typeof value === 'number' ? value : null, schedule),
        'fixit-door',
      );
    });
    const label = text('span', undefined, side.label);
    label.style.cssText = `font-size:12.5px;color:${P.soft}`;
    row.append(select, label);
    doorBlock.append(row);
  }
  root.append(doorBlock);

  /* ---- the banks ---- */
  const rezone = fixitRezoneView(inputs.rezone);
  const banksBlock = section(COPY.rezoneEyebrow, COPY.rezoneHint);
  banksBlock.append(header(rezone.header));
  for (const car of rezone.cars) {
    const row = line(`${prefix}-car ${prefix}-car-${car.key}`);
    const standing = inputs.rezone.cars.find((candidate) => candidate.id === car.key)?.standingBankId ?? '';
    const select = selectOf(car.options, car.label, rezone.header.atBudget);
    select.addEventListener('change', () => {
      press(setCarBank(entry, state, car.key, select.value === '' ? null : select.value, standing, schedule), 'fixit-rezone');
    });
    const label = text('span', undefined, car.label);
    label.style.cssText = 'font-size:13px;font-weight:600';
    row.append(label, select);
    banksBlock.append(row);
  }
  for (const bank of rezone.banks) {
    const block = doc.createElement('div');
    block.className = `${prefix}-bank ${prefix}-bank-${bank.key}`;
    const name = text('div', undefined, `${bank.name} — ${COPY.rezoneFloorsLabel}`);
    name.style.cssText = 'font-size:12.5px;font-weight:600;margin-top:6px';
    block.append(name);
    if (bank.pairedNote !== undefined) {
      const note = text('div', undefined, bank.pairedNote);
      note.style.cssText = `font-size:12px;color:${P.soft}`;
      block.append(note);
    }
    if (bank.floors !== undefined) {
      const chips = doc.createElement('div');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px';
      const standingFloors = inputs.rezone.banks.find((candidate) => candidate.id === bank.key)?.standingFloors ?? [];
      for (const floor of bank.floors) {
        const chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = `${prefix}-floor-chip`;
        chip.dataset['floor'] = floor.id;
        chip.textContent = floor.id;
        chip.setAttribute('aria-label', `${bank.name}: ${floor.label}`);
        chip.setAttribute('aria-pressed', floor.served ? 'true' : 'false');
        chip.disabled = deps.running || rezone.header.atBudget;
        chip.style.cssText = [
          'min-width:28px',
          'padding:2px 5px',
          `border:1px solid ${floor.served ? P.accent : P.rule}`,
          `border-radius:${String(P.radius)}px`,
          `background:${floor.served ? P.accent : P.paper}`,
          `color:${floor.served ? P.paper : P.soft}`,
          `font:11px ${P.mono}`,
          `cursor:${chip.disabled ? 'not-allowed' : 'pointer'}`,
        ].join(';');
        chip.addEventListener('click', () => {
          press(toggleBankFloor(entry, state, bank.key, floor.id, standingFloors, schedule), 'fixit-rezone');
        });
        chips.append(chip);
      }
      block.append(chips);
    }
    if (bank.plate !== undefined) {
      const row = line(`${prefix}-plate`);
      const select = selectOf(bank.plate.options, `${bank.name} — ${bank.plate.label}`, rezone.header.atBudget);
      select.addEventListener('change', () => press(togglePlate(entry, state, bank.key, schedule), 'fixit-rezone'));
      const label = text('span', undefined, bank.plate.label);
      label.style.cssText = `font-size:12.5px;color:${P.soft}`;
      row.append(label, select);
      block.append(row);
    }
    banksBlock.append(block);
  }
  root.append(banksBlock);

  /* ---- the tenancies — § D1001: drawn on every case, inert with its sentence where none is authored ---- */
  const tenancy = fixitTenancyView(inputs.tenancy);
  const tenancyBlock = section(COPY.tenancyEyebrow, '');
  tenancyBlock.className = `${prefix}-tenancy`;
  tenancyBlock.append(
    header({ heading: tenancy.heading, priced: tenancy.priced, atBudget: tenancy.atBudget }),
  );
  if (tenancy.none !== undefined) {
    const none = text('p', `${prefix}-tenancy-none`, tenancy.none);
    none.style.cssText = `font-size:12.5px;line-height:1.5;color:${P.soft};margin:4px 0 0`;
    tenancyBlock.append(none);
  }
  for (const cohort of tenancy.cohorts) {
    const row = line(`${prefix}-tenancy-cohort ${prefix}-tenancy-${cohort.key}`);
    const select = selectOf(cohort.options, cohort.name, tenancy.atBudget);
    select.addEventListener('change', () => {
      press(
        setTenancyPosition(entry, state, cohort.key, select.value === '' ? null : select.value, schedule),
        'fixit-tenancy',
      );
    });
    const label = text('span', undefined, cohort.name);
    label.style.cssText = 'font-size:13px;font-weight:600';
    row.append(label, select);
    const reason = text('p', undefined, cohort.reason);
    reason.style.cssText = `font-size:12px;line-height:1.5;color:${P.soft};margin:2px 0 0`;
    tenancyBlock.append(row, reason);
  }
  root.append(tenancyBlock);
  return root;

  /* ---- builders ---- */

  function text(tag: string, className: string | undefined, content: string): HTMLElement {
    const node = doc.createElement(tag);
    if (className !== undefined) node.className = className;
    node.textContent = content;
    return node;
  }

  function line(className: string): HTMLElement {
    const node = doc.createElement('div');
    node.className = className;
    node.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px';
    return node;
  }

  function section(eyebrow: string, hint: string): HTMLElement {
    const node = doc.createElement('div');
    node.style.cssText = `border-top:1px solid ${P.rule};padding-top:10px`;
    const head = text('div', undefined, eyebrow);
    head.style.cssText = `font:600 10px ${P.mono};letter-spacing:.08em;color:${P.label}`;
    node.append(head);
    if (hint !== '') {
      const note = text('p', undefined, hint);
      note.style.cssText = `font-size:12px;line-height:1.5;color:${P.soft};margin:4px 0 6px`;
      node.append(note);
    }
    return node;
  }

  function header(view: FixitGroupHeader): HTMLElement {
    const node = doc.createElement('div');
    node.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:6px';
    const heading = text('span', undefined, view.heading);
    heading.style.cssText = `font-size:13px;font-weight:700;color:${P.ink}`;
    const priced = text('span', undefined, view.priced);
    priced.style.cssText = `margin-left:auto;font:10px ${P.mono};color:${view.atBudget ? P.alarm : P.label}`;
    node.append(heading, priced);
    return node;
  }

  /**
   * A select over a family's options. `held` is the budget's refusal: the row is not yet bought
   * and cannot be — the control is disabled and says why on its face through the group header,
   * which is where the price is.
   */
  function selectOf(options: readonly FixitSelectOption[], label: string, held: boolean): HTMLSelectElement {
    const select = doc.createElement('select');
    select.setAttribute('aria-label', label);
    select.disabled = deps.running || held;
    if (held) select.title = COPY.groupAtBudget;
    select.style.cssText = [
      `border:1px solid ${P.rule}`,
      `border-radius:${String(P.radius)}px`,
      `background:${P.paper}`,
      `color:${select.disabled ? P.faint : P.ink}`,
      'font-size:12.5px',
      'padding:3px 6px',
      'max-width:100%',
      `cursor:${select.disabled ? 'not-allowed' : 'pointer'}`,
    ].join(';');
    for (const option of options) {
      const node = doc.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.selected;
      select.append(node);
    }
    return select;
  }
}

/** The door-hold target a surface opens on: every car. */
export const DEFAULT_DOOR_TARGET = EVERY_CAR;
