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
 * ## The floors are shown twice, on purpose, in two different orders
 *
 * The **Floors** table is in *building* order — highest `index` at the top, the direction the
 * preview draws (`U1`, `ED-01a`). The **Declaration order** list below it is the `floors` array as
 * the file writes it, and it is the only place `moveFloor` is offered, because it is the only place
 * that operation has a visible effect. Those two orders are different questions about one document
 * — *which floor is above which* and *what does the file look like* — and one widget answering both
 * is what put a control on screen that never did what its arrow implied (`docs/07` § 8).
 *
 * Each view says which order it is in and what that order means. A second table that is merely a
 * different sort, with nothing saying what it is for, would reproduce the defect rather than close
 * it.
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
} from '@elevator-sim/core/browser';

import { checkAccessCompatibility } from '../access/dispatcherCredentials.js';
import {
  LENS_OPERATIONAL_NOTE,
  credentialGroupsIn,
  credentialLensFor,
  type CredentialLens,
} from '../access/zoning.js';
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
} from '../editor/editorEdits.js';
import { EditorHistory } from '../editor/editorHistory.js';
import {
  declarationOrderMatchesBuildingOrder,
  floorsInBuildingOrder,
  previewGeometry,
} from '../editor/editorPreview.js';
import {
  issuesMayBeIncomplete,
  summariseReport,
  validateBuilding,
  validateBuildingText,
  type ValidationReport,
} from '../editor/editorValidate.js';
import { buildLayout } from '../render/layout.js';
import { describePreview, drawPreview } from '../render/preview.js';
import type { Canvas2DLike, Theme } from '../render/canvas.js';
import type { BrowserResources } from './data.js';

/**
 * Right gutter wide enough for `114.6 m  not permitted` — the lens's per-floor word.
 *
 * Measured rather than guessed: 22 characters at the 12 px monospace face's ~7.2 px advance is
 * 158 px. Bigger was tried first and is worse — at 190 px the preview pane on an 800 px window
 * dropped two of Secure Tower's six shafts to pay for it, which trades a fact the reader asked
 * for against one they did not.
 */
const LENS_GUTTER_RIGHT_PX = 160;
/** Bottom band the lens's four legend lines occupy, so they never sit over the lowest floors. */
const LENS_FOOTER_PX = 92;

export interface EditorHandle {
  /** Re-draw at the current size. Called when the tab becomes visible or the window resizes. */
  refresh(): void;
  /**
   * The viewer's dispatcher selection moved — `docs/10` § 11 **W8**.
   *
   * § 10.3's note is a fact about a *pairing*, and half of the pair lives on the other surface.
   * Without this, authoring an access zone here and then switching the viewer to a conventional
   * dispatcher would leave the editor's note naming a profile nobody has selected any more.
   */
  dispatcherChanged(): void;
  /** `ED-23` — is there an unsaved edit? */
  isDirty(): boolean;
  /**
   * Open the shipped building with this id, if it is safe to — `D11`.
   *
   * The two panes used to hold independent opinions about which building was on screen:
   * `?building=secure-tower` loaded Secure Tower in the viewer and **Garden Apartments** in the
   * editor, because the editor opened `resources.entries[0]` and nothing ever told it otherwise.
   *
   * Silently does nothing in three cases, and each is deliberate: the editor already holds that
   * building; there is an unsaved edit (following a tab switch is not worth discarding work, and
   * a modal on every tab switch is worse than the mismatch); or no shipped entry has that id,
   * which is the case for a blank or imported document. `ED-23`'s guarantee is unchanged.
   */
  showBuilding(buildingId: string): void;
  /** Id of the document currently open, shipped or not — the other half of `D11`. */
  currentBuildingId(): string;
}

export interface EditorOptions {
  readonly resources: BrowserResources;
  /**
   * The palette the preview draws in, asked for at draw time.
   *
   * A function rather than a value, because the reader can change the theme while this editor is
   * mounted and a captured palette would leave the preview on whichever mode the page opened in.
   * Optional and defaulting to the dark palette, so a caller that has no theme layer is unchanged —
   * which is exactly what the preview did before the light mode existed.
   */
  readonly theme?: (() => Theme) | undefined;
  /** `ED-04`/`ED-T8` — one control from a valid edit to a run in the viewer. */
  readonly onRun: (building: BuildingConfig) => void;
  /**
   * Which shipped building to open with — `D11`. Falls back to the first entry when absent or
   * unknown, which is what the editor did unconditionally before.
   */
  readonly initialBuildingId?: string | undefined;
  /**
   * A shipped building was opened here. `D11`'s other direction: the viewer's own selector
   * follows, so the URL and both panes name one building.
   *
   * Not fired for **Start from blank** or **Import**: neither produces a document the viewer's
   * `<select>` can hold, and setting it to a stale id would be the mismatch again with the
   * arrow reversed.
   */
  readonly onOpen?: ((buildingId: string) => void) | undefined;
  /**
   * Ask the user to confirm something. Resolves `true` to proceed.
   *
   * `okLabel` is not decoration: the dialog's affirmative button said "Discard" for every
   * question, including "Open it anyway so they can be fixed here?" — where discarding is not
   * what the button does. Found by reading the dialog on screen.
   */
  readonly confirm: (message: string, okLabel: string) => Promise<boolean>;
  /**
   * Which dispatcher the **viewer** currently has selected — `docs/10` § 11 **W8**.
   *
   * A function rather than a value because the answer changes while the editor is mounted, and
   * the acceptance case is exactly that: *"authoring an access zone on a building and switching
   * to a conventional dispatcher raises it live."* Read at render time.
   *
   * **Required, and it was optional until this cost the feature.** Wave 10 rebuilt the shell and
   * dropped this option from the only call site; `renderAccessNote` then took its
   * `profile === undefined` early return on every render and blanked itself, so § D159's warning
   * was dead on this surface from `22a1021` until it was driven. Nothing went red, because
   * `checkAccessCompatibility` kept its own unit tests and the honesty search kept driving it
   * directly — the seam was what broke, not the function.
   *
   * The optionality was there so a test could mount without one. No such test exists, and no test
   * can: this mount is DOM-bound and the suite has no jsdom, which is why `honesty/derive.test.ts`
   * excludes it. So the exemption protected nothing and hid a live regression. Required means the
   * compiler is the guard, which is the only guard this seam can have.
   */
  readonly currentDispatcherId: () => string;
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
  const declaration = mountDeclarationSection(el<HTMLElement>('ed-floors'));
  const rangesNode = el<HTMLElement>('ed-ranges');
  const banksNode = el<HTMLElement>('ed-banks');
  const zonesNode = el<HTMLElement>('ed-zones');
  const lensSelect = el<HTMLSelectElement>('ed-lens');
  const lensNote = el<HTMLElement>('ed-lens-note');
  const accessNote = el<HTMLElement>('ed-access-note');
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

  // `D11`: the viewer's chosen building wins over "whatever is first in `data/`".
  const first =
    resources.entries.find((entry) => entry.config.id === options.initialBuildingId) ??
    resources.entries[0];
  const history = new EditorHistory(
    first === undefined ? blankBuilding(resources.elevatorSpecs, resources.trafficProfiles) : structuredClone(first.config),
  );
  /**
   * The `data/` file the open document came from, or `undefined` for a blank or imported one.
   *
   * Tracked rather than derived, because `openSelect`'s option values are **file names** and the
   * cancel path used to put `history.current.id` back into it — an id is not a file name, so
   * declining "discard and open" left the control showing the first option while the editor held
   * a different building. One of the two ways the panes could disagree; `D11` is the other.
   */
  let openFile: string | undefined = first?.file;
  if (openFile !== undefined) openSelect.value = openFile;
  let report: ValidationReport = validate(history.current);
  /** Text the reader typed that does not parse. Kept so `ED-18` does not lose their work. */
  let pendingJson: string | undefined;
  /**
   * The credential the lens is looking through, or `''` for **off** — `docs/10` § 10.1.
   *
   * Editor state and not document state: it changes nothing about the building and must not
   * appear in the JSON, the undo stack or the download. A mode, not a field.
   */
  let lensGroup = '';

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
    for (const floor of floorsInBuildingOrder(floors)) {
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
      /*
       * No ⇧/⇩ here, and that is the change `ED-24` records.
       *
       * They used to sit in this row. `moveFloor` moves a floor within the **declaration array**
       * and deliberately renumbers neither `index` nor `heightM` — its own docstring says why, and
       * the reason is good: the loader fails a building whose two disagree (`floor-height-order`),
       * and an editor that silently rewrote either would settle a modelling error by fiat. So in a
       * table sorted by `index` those arrows moved nothing the reader could see: the row they were
       * attached to stayed exactly where it was, and the only thing that changed was the Document
       * textarea further down the page. Honest titles made that legible without making it useful.
       *
       * The operation is unchanged and is offered in {@link renderDeclaration}, where the list
       * *is* the array and pressing ⇩ moves the row. The ordering control in **this** table is
       * `index`, which is the field that decides which floor is above which.
       */
      actions.append(
        button('✕', () => commit(removeFloor(building, floor.id)), `remove floor ${floor.id}`),
      );
      row.append(actions);
      floorsBody.append(row);
    }
  }

  /**
   * The declaration-order view — `ED-24`, `ED-25`, and `moveFloor`'s only caller.
   *
   * The list is `building.floors` **as it stands**, with no sort anywhere: this view's whole claim
   * is that it shows the array, so deriving its order from anything would make the claim false. The
   * position numbers come from `<ol>` rather than from arithmetic for the same reason.
   *
   * `index` and `heightM` are printed, not editable. They are edited in the table above, and
   * repeating the inputs here would offer two controls for one field and invite exactly the
   * renumber-to-match that `moveFloor`'s docstring refuses.
   *
   * **Nothing in here decides what is legal.** The disabled ⇧ on the first row and ⇩ on the last
   * are a no-op guard, not a verdict — `moveFloor` clamps and would return the same document.
   * Whether the reordered document loads is `parseBuilding`/`resolveBuilding`'s answer, rendered by
   * {@link renderValidation} from `report.issues`, and this list never offers a second one (§ D67).
   */
  function renderDeclaration(building: BuildingConfig): void {
    const floors = building.floors ?? [];
    declaration.list.replaceChildren();

    if (floors.length === 0) {
      declaration.agreement.textContent =
        (building.floorRanges?.length ?? 0) > 0
          ? 'This building declares no explicit floors — its floors come from ranges, which the loader expands. A range has no position in the floors array to move.'
          : 'No floors yet.';
      return;
    }

    for (const [at, floor] of floors.entries()) {
      const item = document.createElement('li');
      const label = floor.label === undefined ? '' : ` “${floor.label}”`;
      const up = button(
        '⇧',
        () => commit(moveFloor(building, floor.id, -1)),
        `move floor ${floor.id} one place earlier in the floors array`,
      );
      const down = button(
        '⇩',
        () => commit(moveFloor(building, floor.id, 1)),
        `move floor ${floor.id} one place later in the floors array`,
      );
      up.disabled = at === 0;
      down.disabled = at === floors.length - 1;
      item.append(
        `${floor.id}${label} — index ${String(floor.index)}, ${String(floor.heightM)} m  `,
        up,
        down,
      );
      declaration.list.append(item);
    }

    // Descriptive, and the reason the buttons are legible: press one and this sentence changes.
    // Two orders differing is ordinary — four of the five shipped buildings differ on open — so it
    // is stated as a fact about the file and never as a fault with it.
    declaration.agreement.textContent = declarationOrderMatchesBuildingOrder(floors)
      ? 'This file happens to declare its floors in the same order the table above shows them — top floor first.'
      : 'This file declares its floors in a different order from the table above. That is ordinary: most of the shipped buildings are written bottom-up.';
  }

  function renderRanges(building: BuildingConfig): void {
    rangesNode.replaceChildren();
    const ranges = building.floorRanges ?? [];
    // `U1`: a range is a block of floors, so the list of them runs the way the building does —
    // the highest block first. The number in `range N` and the `✕` both stay bound to the
    // document position, because that is what removing one addresses.
    const ordered = [...ranges.entries()].sort(([, a], [, b]) => b.fromIndex - a.fromIndex);
    for (const [index, range] of ordered) {
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
      // `U1`: `.checklist label` is `display: flex`, so this is a *vertical* list of floors and
      // reads top-to-bottom like the table above it and the preview beside it. `floorIds` arrives
      // ascending (`expandFloors` sorts by index), so it is reversed for display only — the
      // committed `servesFloors` below stays in the building's ascending order.
      for (const floorId of [...floorIds].reverse()) {
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
    renderLensPicker(building);
    renderAccessNote(building);
  }

  /**
   * The lens's credential picker — `docs/10` § 10.2's *"autocomplete over groups already used in
   * this building"*, in its simplest honest form.
   *
   * Options come from the document, never from a vocabulary: `core` has none, and inventing one
   * would be a second source of truth about what a credential group is. A group the reader types
   * into a zone appears here on the next render; delete it and the lens falls back to **off**
   * rather than looking through a credential the building no longer mentions.
   */
  function renderLensPicker(building: BuildingConfig): void {
    const groups = credentialGroupsIn(building.accessZones);
    if (!groups.includes(lensGroup)) lensGroup = '';
    lensSelect.replaceChildren(new Option('off', ''));
    for (const group of groups) lensSelect.append(new Option(group, group));
    lensSelect.value = lensGroup;
    lensSelect.disabled = groups.length === 0;
    lensNote.textContent =
      groups.length === 0
        ? 'no credential groups in this building yet — add an access zone to use the lens'
        : LENS_OPERATIONAL_NOTE;
  }

  /** § 10.3, in the editor, against whatever dispatcher the viewer currently names. */
  function renderAccessNote(building: BuildingConfig): void {
    const dispatcherId = options.currentDispatcherId?.();
    const profile = resources.dispatcherProfiles.profiles.find(
      (candidate) => candidate.id === dispatcherId,
    );
    const resolved = report.resolved;
    if (profile === undefined || resolved === undefined) {
      accessNote.textContent = '';
      return;
    }
    accessNote.textContent =
      checkAccessCompatibility({
        buildingName: building.name,
        floorIds: resolved.floors.map((floor) => floor.id),
        accessZones: resolved.accessZones,
        profile,
        profiles: resources.dispatcherProfiles.profiles,
      }).warning ?? '';
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
    // `docs/10` § 10.1's non-test caller. Built from the same geometry the picture is drawn from,
    // so the lens cannot disagree with the shafts beside it about which floors are served.
    const lens: CredentialLens | undefined =
      lensGroup === ''
        ? undefined
        : credentialLensFor({
            floors: geometry.floors,
            shafts: geometry.shafts,
            accessZones: building.accessZones,
            credentialGroup: lensGroup,
          });

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
      // The lens costs two things the default geometry does not have room for, and both were
      // found by driving it on Secure Tower: the right gutter has to fit `114.6 m  not permitted`
      // rather than `114.6 m`, and the four legend lines at the bottom sat over the lobby. Asked
      // for here rather than inside `drawPreview`, because the layout is the caller's to choose
      // and a renderer that resized its own plot would be deciding twice.
      ...(lens === undefined ? {} : { gutterRightPx: LENS_GUTTER_RIGHT_PX, footerPx: LENS_FOOTER_PX }),
    });
    drawPreview(ctx as unknown as Canvas2DLike, {
      geometry,
      layout,
      title: `${building.name} — preview (no run)`,
      caption: summariseReport(report),
      lens,
      // The second stage surface. Without this the building preview stays dark on a light page,
      // which is the same half-repaint the canvas had, one panel over.
      ...(options.theme === undefined ? {} : { theme: options.theme() }),
    });
    previewCanvas.setAttribute('aria-label', describePreview(geometry, lens));
  }

  function render(): void {
    const building = history.current;
    renderIdentity(building);
    renderFloors(building);
    renderDeclaration(building);
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
        openSelect.value = openFile ?? '';
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
    openFile = entry.file;
    pendingJson = undefined;
    report = validate(history.current);
    render();
    options.onOpen?.(entry.config.id);
  }

  /** `D11` — see {@link EditorHandle.showBuilding} for the three cases this declines. */
  function showBuilding(buildingId: string): void {
    if (history.current.id === buildingId) return;
    if (history.state.isDirty) return;
    const entry = resources.entries.find((candidate) => candidate.config.id === buildingId);
    if (entry === undefined) return;
    clearError();
    history.reset(structuredClone(entry.config));
    openFile = entry.file;
    openSelect.value = entry.file;
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
      // The open document no longer came from `data/`, and the control must not claim it did.
      openFile = undefined;
      openSelect.value = '';
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
      openFile = undefined;
      openSelect.value = '';
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

  lensSelect.addEventListener('change', () => {
    lensGroup = lensSelect.value;
    renderPreview();
  });

  render();

  return {
    refresh: renderPreview,
    // Deliberately **not** folded into `refresh`, which fires on every window resize and on every
    // tab switch: `render()` rebuilds every form row, and doing that on a resize would move the
    // reader's focus out of whatever field they were typing in. This is the one line that has to
    // change, so this is the one line that changes.
    dispatcherChanged: () => {
      renderAccessNote(history.current);
    },
    isDirty: () => history.state.isDirty,
    showBuilding,
    currentBuildingId: () => history.current.id,
  };
}

/* -------------------------------------------------------------------------- *
 * Small DOM helpers
 * -------------------------------------------------------------------------- */

/**
 * What each of the two floor views is, said on the screen rather than in this file — `ED-25`.
 *
 * The requirement is not "a second list": it is that a reader can tell the two apart and knows what
 * each ordering means. A sort with no statement of what it is for is the defect this view exists to
 * close, wearing a different hat.
 *
 * The last sentence is load-bearing and is the reason this paragraph is not shorter. Reordering an
 * array is the kind of edit a reader expects to be told is safe or unsafe, and this view must not
 * tell them: § D67 gives every legality opinion in the editor to `parseBuilding`/`resolveBuilding`,
 * and the Validation panel is where their answer appears. So the text points at it instead of
 * pre-empting it.
 */
const DECLARATION_NOTE =
  'The table above is in building order — highest index at the top, the direction the preview ' +
  'draws. This list is the floors array in the order the file writes it, which is what you see in ' +
  'the Document (JSON) below. ⇧ and ⇩ move a floor within that array and change nothing else: ' +
  'index and heightM are shown here read-only and are edited in the table above, because the ' +
  'loader requires the two to agree (floor-height-order) and an editor that renumbered them to ' +
  'follow a reorder would be settling a modelling error on your behalf. Whether the document is ' +
  'legal is the loader’s answer, listed under Validation below; this list never says.';

/** The declaration-order view's own nodes. Rebuilt on every edit by `renderDeclaration`. */
interface DeclarationSection {
  readonly list: HTMLOListElement;
  readonly agreement: HTMLElement;
}

/**
 * Build the declaration-order fieldset and insert it after the Floors one.
 *
 * Built here rather than declared in `index.html` because that file is being edited by another
 * lane in this same tree and is outside this change's ownership; the nodes it needs are a fieldset,
 * two paragraphs and an `<ol>`, all of which inherit the stylesheet's element rules, so nothing is
 * lost by constructing them. If `index.html` later grows the markup, this function is what to
 * delete.
 */
function mountDeclarationSection(floorsTable: HTMLElement): DeclarationSection {
  const box = document.createElement('fieldset');
  box.id = 'ed-declaration';
  const legend = document.createElement('legend');
  legend.textContent = 'Declaration order — the floors array as the file writes it';
  const note = document.createElement('p');
  note.className = 'dim';
  note.style.margin = '0 0 6px';
  note.textContent = DECLARATION_NOTE;
  const agreement = document.createElement('p');
  agreement.id = 'ed-declaration-agreement';
  agreement.className = 'dim';
  agreement.style.margin = '0 0 6px';
  const list = document.createElement('ol');
  list.id = 'ed-declaration-list';
  box.append(legend, note, agreement, list);

  const floorsBox = floorsTable.closest('fieldset');
  if (floorsBox === null) floorsTable.after(box);
  else floorsBox.after(box);
  return { list, agreement };
}

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
