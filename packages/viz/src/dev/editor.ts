/**
 * The building editor, wired to the DOM — `UX.md` Surface C.
 *
 * Everything with a decision in it lives in `src/editor*.ts` and is tested under Node: the edit
 * operations (`edits.ts`), the validation (`validate.ts`), the undo stack (`history.ts`) and the
 * run-less preview geometry (`preview.ts`). This file is the part that cannot be tested without a
 * browser — reading form fields, appending rows, moving focus — and it is deliberately thin so
 * that the untested part is the part where being wrong is visible immediately.
 *
 * ## The three kinds of zoning have three sections
 *
 * `CLAUDE.md` forbids collapsing them, so the form does not offer a way to. Service zoning is a
 * checklist inside each bank; access zoning is its own fieldset with its own list; operational
 * zoning is a paragraph saying where it actually lives. A reader who wants "the zones" is told
 * three times that there is no such thing.
 *
 * ## Validation is never partial
 *
 * The issue list is rebuilt from `ValidationReport.issues` in full on every edit, and when the
 * document only got as far as the schema stage the list says so — `ED-20`/`RV-18` make showing
 * one issue of five a regression against the loader's own contract, and a list that silently
 * *becomes* a different five after a fix is the same defect with better manners.
 */

import {
  BUILDING_TYPES,
  type BuildingConfig,
  type BuildingType,
  type CarConfig,
  type FloorConfig,
} from '@elevator-sim/core';

import {
  OPERATIONAL_ZONING_NOTE,
  addBank,
  addCar,
  addFloor,
  addFloorRange,
  blankBuilding,
  moveFloor,
  removeAccessZone,
  removeBank,
  removeCar,
  removeFloor,
  removeFloorRange,
  serializeBuilding,
  setBankServedFloors,
  setCarSpec,
  updateCar,
  updateFloor,
  upsertAccessZone,
} from '../editorEdits.js';
import { EditorHistory } from '../editorHistory.js';
import { previewGeometry } from '../editorPreview.js';
import {
  issuesMayBeIncomplete,
  summariseReport,
  validateBuilding,
  validateBuildingText,
  type ValidationReport,
} from '../editorValidate.js';
import { buildLayout } from '../render/layout.js';
import { describePreview, drawPreview } from '../render/preview.js';
import type { Canvas2DLike } from '../render/canvas.js';
import type { BrowserResources } from './data.js';

const OVERLAY_NONE = 0;

export interface EditorHandle {
  /** Re-draw at the current size. Called when the tab becomes visible or the window resizes. */
  refresh(): void;
  /** `ED-23` — is there an unsaved edit? */
  isDirty(): boolean;
}

export interface EditorOptions {
  readonly resources: BrowserResources;
  /** `ED-04`/`ED-T8` — one control from a valid edit to a run in the viewer. */
  readonly onRun: (building: BuildingConfig) => void;
  /**
   * Ask the user to confirm something. Resolves `true` to proceed.
   *
   * `okLabel` is not decoration: the dialog's affirmative button said "Discard" for every
   * question, including "Open it anyway so they can be fixed here?" — where discarding is not
   * what the button does. Found by reading the dialog on screen.
   */
  readonly confirm: (message: string, okLabel: string) => Promise<boolean>;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing #${id} in index.html`);
  return node as T;
}

function button(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  if (title !== undefined) node.title = title;
  node.addEventListener('click', onClick);
  return node;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const node = document.createElement('label');
  node.append(text, control);
  return node;
}

export function mountEditor(options: EditorOptions): EditorHandle {
  const { resources } = options;
  const specIds = resources.elevatorSpecs.classes.map((elevatorClass) => elevatorClass.id);

  const openSelect = el<HTMLSelectElement>('editor-open');
  const statusNode = el<HTMLElement>('editor-status');
  const errorNode = el<HTMLElement>('editor-error');
  const verdictNode = el<HTMLElement>('ed-verdict');
  const issuesNode = el<HTMLUListElement>('ed-issues');
  const warningsNode = el<HTMLUListElement>('ed-warnings');
  const floorsBody = el<HTMLTableSectionElement>('ed-floors').querySelector('tbody');
  const rangesNode = el<HTMLElement>('ed-ranges');
  const banksNode = el<HTMLElement>('ed-banks');
  const zonesNode = el<HTMLElement>('ed-zones');
  const jsonNode = el<HTMLTextAreaElement>('ed-json');
  const expansionNode = el<HTMLElement>('ed-expansion');
  const previewCanvas = el<HTMLCanvasElement>('preview');
  const idInput = el<HTMLInputElement>('ed-id');
  const nameInput = el<HTMLInputElement>('ed-name');
  const typeSelect = el<HTMLSelectElement>('ed-type');
  const trafficSelect = el<HTMLSelectElement>('ed-traffic');
  const runButton = el<HTMLButtonElement>('editor-run');
  const undoButton = el<HTMLButtonElement>('editor-undo');
  const redoButton = el<HTMLButtonElement>('editor-redo');
  const discardButton = el<HTMLButtonElement>('editor-discard');

  el<HTMLElement>('ed-operational').textContent = OPERATIONAL_ZONING_NOTE;

  for (const type of BUILDING_TYPES) typeSelect.append(new Option(type, type));
  for (const profile of resources.trafficProfiles.profiles) {
    trafficSelect.append(new Option(profile.id, profile.id));
  }
  for (const entry of resources.entries) {
    openSelect.append(new Option(`${entry.config.name} (${entry.file})`, entry.file));
  }

  const first = resources.entries[0];
  const history = new EditorHistory(
    first === undefined ? blankBuilding(resources.elevatorSpecs, resources.trafficProfiles) : structuredClone(first.config),
  );
  let report: ValidationReport = validate(history.current);
  /** Text the reader typed that does not parse. Kept so `ED-18` does not lose their work. */
  let pendingJson: string | undefined;

  function validate(building: BuildingConfig): ValidationReport {
    return validateBuilding(building, resources.elevatorSpecs, {
      file: `${building.id}.json`,
      trafficProfileIds: resources.trafficProfileIds,
    });
  }

  function commit(next: BuildingConfig): void {
    history.apply(next);
    pendingJson = undefined;
    report = validate(history.current);
    render();
  }

  /* ------------------------------------------------------------------ *
   * Rendering the form
   * ------------------------------------------------------------------ */

  function renderIdentity(building: BuildingConfig): void {
    if (document.activeElement !== idInput) idInput.value = building.id;
    if (document.activeElement !== nameInput) nameInput.value = building.name;
    typeSelect.value = building.type;
    trafficSelect.value = building.trafficProfile;
  }

  function renderFloors(building: BuildingConfig): void {
    if (floorsBody === null) return;
    floorsBody.replaceChildren();
    const floors = building.floors ?? [];
    if (floors.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'dim';
      cell.textContent =
        floors.length === 0 && (building.floorRanges?.length ?? 0) > 0
          ? 'no explicit floors — this building is declared by ranges only'
          : 'no floors yet';
      row.append(cell);
      floorsBody.append(row);
      return;
    }
    for (const floor of floors) {
      const row = document.createElement('tr');
      row.append(
        cellWithText(floor.id),
        cellWithNumber(floor.index, (value) =>
          commit(updateFloor(building, floor.id, { index: value })),
        ),
        cellWithNumber(
          floor.heightM,
          (value) => commit(updateFloor(building, floor.id, { heightM: value })),
          0.1,
        ),
        cellWithNumber(floor.population, (value) =>
          commit(updateFloor(building, floor.id, { population: value })),
        ),
        cellWithCheckbox(floor.isEntrance === true, (value) =>
          commit(updateFloor(building, floor.id, { isEntrance: value })),
          `floor ${floor.id} is an entrance`,
        ),
        cellWithCheckbox(floor.isTransferFloor === true, (value) =>
          commit(updateFloor(building, floor.id, { isTransferFloor: value })),
          `floor ${floor.id} is a sky lobby`,
        ),
      );
      const actions = document.createElement('td');
      actions.append(
        button('↑', () => commit(moveFloor(building, floor.id, -1)), `move floor ${floor.id} up the list`),
        button('↓', () => commit(moveFloor(building, floor.id, 1)), `move floor ${floor.id} down the list`),
        button('✕', () => commit(removeFloor(building, floor.id)), `remove floor ${floor.id}`),
      );
      row.append(actions);
      floorsBody.append(row);
    }
  }

  function renderRanges(building: BuildingConfig): void {
    rangesNode.replaceChildren();
    const ranges = building.floorRanges ?? [];
    for (const [index, range] of ranges.entries()) {
      const line = document.createElement('div');
      line.className = 'dim';
      line.append(
        `range ${String(index + 1)}: index ${String(range.fromIndex)}–${String(range.toIndex)}, ` +
          `${String(range.startHeightM)} m + ${String(range.floorToFloorM)} m, ` +
          `${String(range.populationPerFloor)} people/floor  `,
        button('✕', () => commit(removeFloorRange(building, index)), 'remove this range'),
      );
      rangesNode.append(line);
    }
  }

  function renderBanks(building: BuildingConfig): void {
    banksNode.replaceChildren();
    const floorIds = (report.resolved?.floors ?? building.floors ?? []).map((floor) => floor.id);
    for (const bank of building.banks) {
      const box = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `bank ${bank.id}`;
      box.append(legend, button('Remove bank', () => commit(removeBank(building, bank.id))));

      for (const car of bank.cars) {
        const row = document.createElement('div');
        const spec = document.createElement('select');
        for (const id of specIds) spec.append(new Option(id, id));
        spec.value = car.spec;
        spec.addEventListener('change', () => {
          commit(setCarSpec(building, bank.id, car.id, spec.value));
        });
        const speed = document.createElement('input');
        speed.type = 'number';
        speed.step = '0.05';
        speed.min = '0.1';
        speed.placeholder = String(specSpeed(car.spec));
        if (car.ratedSpeedMps !== undefined) speed.value = String(car.ratedSpeedMps);
        speed.addEventListener('change', () => {
          const value = speed.value.trim();
          commit(
            updateCar(
              building,
              bank.id,
              car.id,
              value === '' ? { ratedSpeedMps: undefined } : { ratedSpeedMps: Number(value) },
            ),
          );
        });
        row.append(
          `car ${car.id} `,
          labelled('class ', spec),
          labelled('speed m/s ', speed),
          document.createTextNode(` ${describeSpec(car)} `),
          button('✕', () => commit(removeCar(building, bank.id, car.id)), `remove car ${car.id}`),
        );
        box.append(row);
      }

      box.append(
        button('Add car', () => {
          commit(addCar(building, bank.id, nextCar(bank.cars, specIds[0] ?? 'gearless-traction')));
        }),
      );

      const zoning = document.createElement('div');
      zoning.className = 'checklist';
      const served = new Set(bank.servesFloors);
      for (const floorId of floorIds) {
        const box2 = document.createElement('input');
        box2.type = 'checkbox';
        box2.checked = served.has(floorId);
        box2.addEventListener('change', () => {
          const next = box2.checked
            ? [...bank.servesFloors, floorId]
            : bank.servesFloors.filter((id) => id !== floorId);
          // Kept in the building's own floor order rather than in click order, so the diff of
          // two edits is readable and `servesFloors` matches how the shipped files are written.
          const ordered = floorIds.filter((id) => next.includes(id));
          commit(setBankServedFloors(building, bank.id, ordered));
        });
        zoning.append(labelled(floorId, box2));
      }
      const zoningLabel = document.createElement('p');
      zoningLabel.className = 'dim';
      zoningLabel.textContent = 'service zoning — floors these shafts physically reach';
      box.append(zoningLabel, zoning);
      banksNode.append(box);
    }
  }

  function renderZones(building: BuildingConfig): void {
    zonesNode.replaceChildren();
    for (const zone of building.accessZones ?? []) {
      const row = document.createElement('div');
      const floors = document.createElement('input');
      floors.size = 24;
      floors.value = zone.floors.join(' ');
      floors.addEventListener('change', () => {
        commit(upsertAccessZone(building, { ...zone, floors: splitIds(floors.value) }));
      });
      const groups = document.createElement('input');
      groups.size = 18;
      groups.value = zone.credentialGroups.join(' ');
      groups.addEventListener('change', () => {
        commit(upsertAccessZone(building, { ...zone, credentialGroups: splitIds(groups.value) }));
      });
      row.append(
        `${zone.id} `,
        labelled('floors ', floors),
        labelled('credential groups ', groups),
        button('✕', () => commit(removeAccessZone(building, zone.id)), `remove access zone ${zone.id}`),
      );
      zonesNode.append(row);
    }
    if ((building.accessZones ?? []).length === 0) {
      const empty = document.createElement('p');
      empty.className = 'dim';
      empty.textContent = 'no access zones — every credential group may select every floor';
      zonesNode.append(empty);
    }
  }

  function renderValidation(): void {
    const summary = summariseReport(report);
    verdictNode.textContent = summary;
    verdictNode.className = report.valid ? 'ok' : 'bad';

    issuesNode.replaceChildren();
    // Every issue, every time. Not the first, and not a truncated list.
    for (const issue of report.issues) {
      const item = document.createElement('li');
      item.className = 'bad';
      const where = document.createElement('code');
      where.textContent = `${issue.file}:${issue.path === '' ? '(root)' : issue.path}`;
      item.append(where, ` — ${issue.message}`);
      issuesNode.append(item);
    }
    if (issuesMayBeIncomplete(report)) {
      const note = document.createElement('li');
      note.className = 'dim';
      note.textContent =
        'this document stopped at the schema stage, so cross-reference checks have not run yet — more issues may appear once these are fixed.';
      issuesNode.append(note);
    }

    warningsNode.replaceChildren();
    for (const warning of report.warnings) {
      const item = document.createElement('li');
      item.className = 'warn';
      const where = document.createElement('code');
      where.textContent = `${warning.file}:${warning.path}`;
      item.append(where, ` — ${warning.message} (warning: suspicious, not fatal)`);
      warningsNode.append(item);
    }

    // C.3: Run is disabled with a reason when invalid, and enabled on warnings alone.
    runButton.disabled = !report.valid;
    runButton.title = report.valid
      ? 'simulate this building in the run viewer'
      : `disabled: ${summary}. Fix the problems listed below.`;
  }

  function renderPreview(): void {
    const building = history.current;
    const geometry = previewGeometry(building, report.resolved);
    expansionNode.textContent = ` — ${geometry.expansion}`;

    const ctx = previewCanvas.getContext('2d');
    if (ctx === null) {
      previewCanvas.setAttribute('aria-label', 'This browser has no 2D canvas context.');
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = previewCanvas.clientWidth;
    const cssHeight = previewCanvas.clientHeight;
    const backingWidth = Math.round(cssWidth * ratio);
    const backingHeight = Math.round(cssHeight * ratio);
    if (previewCanvas.width !== backingWidth || previewCanvas.height !== backingHeight) {
      previewCanvas.width = backingWidth;
      previewCanvas.height = backingHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const layout = buildLayout({
      width: cssWidth,
      height: cssHeight,
      floors: geometry.floors,
      shafts: geometry.shafts,
      overlayWidthPx: OVERLAY_NONE,
    });
    drawPreview(ctx as unknown as Canvas2DLike, {
      geometry,
      layout,
      title: `${building.name} — preview (no run)`,
      caption: summariseReport(report),
    });
    previewCanvas.setAttribute('aria-label', describePreview(geometry));
  }

  function render(): void {
    const building = history.current;
    renderIdentity(building);
    renderFloors(building);
    renderRanges(building);
    renderBanks(building);
    renderZones(building);
    renderValidation();
    renderPreview();
    if (pendingJson === undefined && document.activeElement !== jsonNode) {
      jsonNode.value = serializeBuilding(building);
    }
    const state = history.state;
    undoButton.disabled = !state.canUndo;
    redoButton.disabled = !state.canRedo;
    discardButton.disabled = !state.isDirty;
    statusNode.textContent = `${state.isDirty ? 'edited' : 'unchanged'} · ${String(state.depth)} undo step${state.depth === 1 ? '' : 's'}`;
  }

  function specSpeed(specId: string): number {
    const spec = resources.elevatorSpecs.classes.find((candidate) => candidate.id === specId);
    return spec?.ratedSpeedMps.typical ?? 0;
  }

  function describeSpec(car: CarConfig): string {
    const spec = resources.elevatorSpecs.classes.find((candidate) => candidate.id === car.spec);
    if (spec === undefined) return '(unknown class)';
    return `[${String(spec.ratedSpeedMps.min)}–${String(spec.ratedSpeedMps.max)} m/s, ${String(spec.capacityLbRange[0])}–${String(spec.capacityLbRange[1])} lb]`;
  }

  /* ------------------------------------------------------------------ *
   * Controls
   * ------------------------------------------------------------------ */

  function fail(message: string): void {
    errorNode.textContent = message;
    // KB-11: focus moves to the message so a screen reader announces it.
    errorNode.focus();
  }

  function clearError(): void {
    errorNode.textContent = '';
  }

  async function openEntry(file: string): Promise<void> {
    if (history.state.isDirty) {
      const proceed = await options.confirm(
        'This building has unsaved edits. Opening another one discards them. Continue?',
        'Discard and open',
      );
      if (!proceed) {
        openSelect.value = history.current.id;
        return;
      }
    }
    const entry = resources.entries.find((candidate) => candidate.file === file);
    if (entry === undefined) {
      fail(`no such building file: ${file}`);
      return;
    }
    clearError();
    history.reset(structuredClone(entry.config));
    pendingJson = undefined;
    report = validate(history.current);
    render();
  }

  openSelect.addEventListener('change', () => {
    void openEntry(openSelect.value);
  });

  el<HTMLButtonElement>('editor-blank').addEventListener('click', () => {
    void (async () => {
      if (history.state.isDirty) {
        const proceed = await options.confirm(
          'This building has unsaved edits. Starting from blank discards them. Continue?',
          'Discard and start over',
        );
        if (!proceed) return;
      }
      clearError();
      history.reset(blankBuilding(resources.elevatorSpecs, resources.trafficProfiles));
      pendingJson = undefined;
      report = validate(history.current);
      render();
    })();
  });

  el<HTMLInputElement>('editor-import').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    void (async () => {
      const text = await file.text();
      /*
       * `ED-06`: **validated on import, and issues shown before anything is applied.**
       *
       * The first version applied any document the *schema* accepted and showed the
       * cross-reference issues afterwards — so a file naming an unknown elevator class and two
       * floors that do not exist silently replaced the open building, which is exactly what the
       * row forbids. Found by driving the editor.
       *
       * Refusing outright would be worse: an invalid file is precisely the one somebody wants to
       * open in an editor. So the issues are rendered first and the swap is confirmed.
       */
      const imported = validateBuildingText(text, resources.elevatorSpecs, {
        file: file.name,
        trafficProfileIds: resources.trafficProfileIds,
      });

      if (imported.building === undefined) {
        // Not even parseable as a building: nothing to open.
        report = imported;
        renderValidation();
        fail(`${file.name} was not applied: ${summariseReport(imported)}`);
        return;
      }

      if (history.state.isDirty) {
        const proceed = await options.confirm(
          `This building has unsaved edits. Importing ${file.name} discards them. Continue?`,
          'Discard and import',
        );
        if (!proceed) return;
      }

      if (!imported.valid) {
        report = imported;
        renderValidation();
        const proceed = await options.confirm(
          `${file.name} has ${String(imported.issues.length)} problem${imported.issues.length === 1 ? '' : 's'}, ` +
            'listed under Validation. Open it anyway so they can be fixed here?',
          'Open anyway',
        );
        if (!proceed) {
          // Put the open document's own verdict back: the list on screen must describe what is
          // on screen, and it currently describes a file that was not opened.
          report = validate(history.current);
          render();
          fail(`${file.name} was not applied.`);
          return;
        }
      }

      clearError();
      history.reset(imported.building);
      pendingJson = undefined;
      report = imported;
      render();
    })();
  });

  undoButton.addEventListener('click', () => {
    history.undo();
    pendingJson = undefined;
    report = validate(history.current);
    render();
  });
  redoButton.addEventListener('click', () => {
    history.redo();
    pendingJson = undefined;
    report = validate(history.current);
    render();
  });
  discardButton.addEventListener('click', () => {
    void (async () => {
      const proceed = await options.confirm(
        'Discard every change back to the loaded document?',
        'Discard',
      );
      if (!proceed) return;
      history.discard();
      pendingJson = undefined;
      report = validate(history.current);
      render();
    })();
  });

  el<HTMLButtonElement>('editor-download').addEventListener('click', () => {
    // ED-19: a browser cannot write to `data/`, so this is a download, and the status line says
    // where it went rather than implying the file on disk changed.
    const blob = new Blob([serializeBuilding(history.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${history.current.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    statusNode.textContent = `downloaded ${history.current.id}.json — move it into data/buildings/ to make it a shipped building`;
  });

  runButton.addEventListener('click', () => {
    if (!report.valid) {
      fail(`this building does not validate: ${summariseReport(report)}`);
      return;
    }
    clearError();
    options.onRun(history.current);
  });

  el<HTMLButtonElement>('ed-add-floor').addEventListener('click', () => {
    commit(addFloor(history.current, nextFloor(history.current.floors ?? [])));
  });
  el<HTMLButtonElement>('ed-add-range').addEventListener('click', () => {
    const floors = history.current.floors ?? [];
    const top = floors.reduce(
      (best, floor) => (floor.index > best.index ? floor : best),
      floors[0] ?? { index: 0, heightM: 0, id: 'G', population: 0 },
    );
    commit(
      addFloorRange(history.current, {
        fromIndex: top.index + 1,
        toIndex: top.index + 10,
        startHeightM: top.heightM + 3.5,
        floorToFloorM: 3.5,
        populationPerFloor: 20,
      }),
    );
  });
  el<HTMLButtonElement>('ed-add-bank').addEventListener('click', () => {
    const building = history.current;
    const floorIds = (building.floors ?? []).map((floor) => floor.id);
    commit(
      addBank(building, {
        id: `bank-${String(building.banks.length + 1)}`,
        servesFloors: floorIds.slice(0, Math.max(2, floorIds.length)),
        cars: [{ id: 'A', spec: specIds[0] ?? 'gearless-traction' }],
      }),
    );
  });
  el<HTMLButtonElement>('ed-add-zone').addEventListener('click', () => {
    const building = history.current;
    commit(
      upsertAccessZone(building, {
        id: `zone-${String((building.accessZones ?? []).length + 1)}`,
        floors: (building.floors ?? []).slice(0, 1).map((floor) => floor.id),
        credentialGroups: ['staff'],
      }),
    );
  });

  for (const [node, key] of [
    [idInput, 'id'],
    [nameInput, 'name'],
  ] as const) {
    node.addEventListener('change', () => {
      commit({ ...history.current, [key]: node.value });
    });
  }
  typeSelect.addEventListener('change', () => {
    commit({ ...history.current, type: typeSelect.value as BuildingType });
  });
  trafficSelect.addEventListener('change', () => {
    commit({ ...history.current, trafficProfile: trafficSelect.value });
  });

  jsonNode.addEventListener('blur', () => {
    const text = jsonNode.value;
    if (text === serializeBuilding(history.current)) return;
    const parsed = validateBuildingText(text, resources.elevatorSpecs, {
      file: `${history.current.id}.json`,
      trafficProfileIds: resources.trafficProfileIds,
    });
    if (parsed.stage === 'json') {
      // ED-18: the editor state is not lost. The text stays exactly as typed.
      pendingJson = text;
      report = parsed;
      renderValidation();
      fail(`the document is not valid JSON: ${parsed.issues[0]?.message ?? 'parse error'}`);
      return;
    }
    clearError();
    if (parsed.building === undefined) {
      // Valid JSON, invalid building. Keep the text so the reader can fix it, and show
      // every issue rather than only the first.
      pendingJson = text;
      report = parsed;
      renderValidation();
      return;
    }
    pendingJson = undefined;
    history.apply(parsed.building);
    report = parsed;
    render();
  });

  render();

  return {
    refresh: renderPreview,
    isDirty: () => history.state.isDirty,
  };
}

/* -------------------------------------------------------------------------- *
 * Small DOM helpers
 * -------------------------------------------------------------------------- */

function cellWithText(text: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function cellWithNumber(
  value: number,
  onChange: (value: number) => void,
  step = 1,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  cell.append(input);
  return cell;
}

function cellWithCheckbox(
  value: boolean,
  onChange: (value: boolean) => void,
  label: string,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => {
    onChange(input.checked);
  });
  cell.append(input);
  return cell;
}

function splitIds(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** A floor id and index that do not collide with an existing one. */
function nextFloor(floors: readonly FloorConfig[]): FloorConfig {
  const maxIndex = floors.reduce((best, floor) => Math.max(best, floor.index), -1);
  const maxHeight = floors.reduce((best, floor) => Math.max(best, floor.heightM), -3.5);
  const index = maxIndex + 1;
  const taken = new Set(floors.map((floor) => floor.id));
  let id = String(index);
  let suffix = 0;
  while (taken.has(id)) {
    suffix += 1;
    id = `${String(index)}-${String(suffix)}`;
  }
  return { id, index, heightM: Math.round((maxHeight + 3.5) * 10) / 10, population: 20 };
}

/** The next unused car letter in a bank. */
function nextCar(cars: readonly CarConfig[], spec: string): CarConfig {
  const taken = new Set(cars.map((car) => car.id));
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!taken.has(letter)) return { id: letter, spec };
  }
  return { id: `car-${String(cars.length + 1)}`, spec };
}
