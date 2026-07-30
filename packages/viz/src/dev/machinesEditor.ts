/**
 * The machine-class editor, mounted — `docs/12-design-handoff.md` § 1.3 **M10**.
 *
 * ## Editing a shipped class never overwrites it
 *
 * § 1.5 B6, and it matters more here than for a dispatcher: `midtown-office.json` names
 * `geared-traction` **by id**, so a reader who mutated that entry would silently change the
 * project's own validation building and every figure measured on it. `specsWithClass` is what makes
 * the save an addition — `authoring/authoring.test.ts` asserts the shipped entry comes back
 * byte-identical and that the file's shared `doors`, `timing` and `loadSensor` blocks travel with
 * it — and this file never writes anywhere else.
 *
 * ## Why there are nine rows and not eleven
 *
 * There is no slider for door time or transfer time. Those are **file-level** blocks in
 * `data/elevator-specs.json` shared by every class, so a per-class control would write a field the
 * loader does not read. The way not to ship a dead control is to not draw it; the way not to
 * silently drop a real one is to say so, which is what `machineSpec.ts`'s docstring does.
 *
 * ## The rise limit is an advisory and this editor says so
 *
 * `config/parse.ts` raises a class's `maxRiseM` as guidance and **builds the bank anyway** — *"the
 * reference envelope is application guidance, not a hard limit"*. Writing *the loader refuses this*
 * would be a false claim about a mechanism, which is the defect class
 * `experiments/src/validation/documentation.test.ts` exists to catch one level up. The row's own
 * help text says advisory, and so does `validateSpec`'s sentence in the building editor.
 */

import { parseElevatorSpecs, type ElevatorSpecs } from '@elevator-sim/core/browser';

import {
  MACHINE_ROWS,
  classFromSpec,
  machineIsDirty,
  machineSummary,
  specFromClass,
  specsWithClass,
  type MachineClass,
  type MachineRow,
  type MachineSpec,
} from '../authoring/machineSpec.js';

import {
  nextSavedId,
  sliderHandlesOf,
  updateSliderRow,
  type SliderHandles,
} from './dispatcherEditor.js';
import { chipRow, fill, setHidden, setText, slider } from './dom.js';
import type { MachinesEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { allClasses, classById } from './state.js';

/* -------------------------------------------------------------------------- *
 * The nine rows — pure
 * -------------------------------------------------------------------------- */

/**
 * The record field each row writes, as it is spelled in `data/elevator-specs.json`.
 *
 * Drawn under the slider as well as named in the tooltip. A tooltip is not discoverable and the
 * field name is what makes the row's claim checkable — the same discipline `patternSpec.ts` applies
 * to its `help` strings, one layer out.
 *
 * A `switch` over a closed key union rather than a lookup keyed by string: the compiler is what
 * makes it total, so a tenth row cannot be added without this being made to name its field.
 */
export function machineFieldOf(key: MachineRow['key']): string {
  switch (key) {
    case 'speedMinMps':
      return 'ratedSpeedMps.min';
    case 'speedTypicalMps':
      return 'ratedSpeedMps.typical';
    case 'speedMaxMps':
      return 'ratedSpeedMps.max';
    case 'accelerationMps2':
      return 'acceleration.typical';
    case 'jerkMps3':
      return 'jerk.typical';
    case 'maxRiseM':
      return 'maxRiseM — an advisory the loader warns on and builds anyway';
    case 'maxFloors':
      return 'maxFloors';
    case 'loadMinLb':
      return 'capacityLbRange[0]';
    case 'loadMaxLb':
      return 'capacityLbRange[1]';
    default:
      /*
       * `MachineRow['key']` is `keyof MachineSpec`, which includes `name` — a field with a text box
       * rather than a slider. `MACHINE_ROWS` declares no row for it, so this branch is unreachable
       * through the shipped list and is written as a total function rather than a `!`.
       */
      return key;
  }
}

/** A row's current value as a number. `name` is not a slider, and reports as zero. */
function rawOf(spec: MachineSpec, key: MachineRow['key']): number {
  const value = spec[key];
  return typeof value === 'number' ? value : 0;
}

export interface MachineRowView {
  readonly row: MachineRow;
  /** The group heading, when this row opens a new group. Empty otherwise. */
  readonly heading: string;
  readonly raw: number;
  readonly value: string;
  readonly field: string;
}

export function machineRowsOf(spec: MachineSpec): readonly MachineRowView[] {
  let group = '';
  return MACHINE_ROWS.map((row): MachineRowView => {
    const heading = row.group === group ? '' : row.group;
    group = row.group;
    return {
      row,
      heading,
      raw: rawOf(spec, row.key),
      value: formatMachineValue(spec, row),
      field: machineFieldOf(row.key),
    };
  });
}

export function formatMachineValue(spec: MachineSpec, row: MachineRow): string {
  const raw = rawOf(spec, row.key);
  switch (row.key) {
    case 'speedMinMps':
    case 'speedTypicalMps':
    case 'speedMaxMps':
    case 'accelerationMps2':
      return `${raw.toFixed(2)}${row.unit}`;
    case 'jerkMps3':
      return `${raw.toFixed(1)}${row.unit}`;
    default:
      return `${String(Math.round(raw))}${row.unit}`;
  }
}

/** A row's edit as a patch. Total over the nine keys, so a tenth is a compile error. */
export function machinePatchFor(key: MachineRow['key'], raw: number): Partial<MachineSpec> {
  switch (key) {
    case 'speedMinMps':
      return { speedMinMps: raw };
    case 'speedTypicalMps':
      return { speedTypicalMps: raw };
    case 'speedMaxMps':
      return { speedMaxMps: raw };
    case 'accelerationMps2':
      return { accelerationMps2: raw };
    case 'jerkMps3':
      return { jerkMps3: raw };
    case 'maxRiseM':
      return { maxRiseM: raw };
    case 'maxFloors':
      return { maxFloors: raw };
    case 'loadMinLb':
      return { loadMinLb: raw };
    case 'loadMaxLb':
      return { loadMaxLb: raw };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- *
 * The rated-speed chips
 * -------------------------------------------------------------------------- */

/**
 * Every rated speed the shipped class table names, ascending and deduplicated.
 *
 * Derived rather than authored. A hand-written ladder of *standard contract speeds* would be a
 * number set this repository has not cited, and the rule is that a reference value comes with its
 * source — so the offered speeds are the ones `data/elevator-specs.json` already puts on a machine.
 */
export function speedLadderOf(specs: ElevatorSpecs): readonly number[] {
  const set = new Set<number>();
  for (const entry of specs.classes) {
    set.add(entry.ratedSpeedMps.min);
    set.add(entry.ratedSpeedMps.typical);
    set.add(entry.ratedSpeedMps.max);
  }
  return [...set].sort((a, b) => a - b);
}

export interface SpeedChipView {
  readonly speed: number;
  readonly label: string;
  readonly pressed: boolean;
}

/**
 * The rated speeds this class may be run at — the ladder, clipped to the class's own band.
 *
 * The band's two ends are always offered, so a class whose band contains no ladder value still has
 * chips; and the current typical is offered when it is inside the band, so the pressed chip always
 * exists. Nothing outside `[min, max]` is offered at all: the loader refuses a car outside its
 * class's band, and offering one so it can be refused later is worse than not offering it.
 */
export function ratedSpeedChipsOf(
  spec: MachineSpec,
  ladder: readonly number[],
): readonly SpeedChipView[] {
  const low = Math.min(spec.speedMinMps, spec.speedMaxMps);
  const high = Math.max(spec.speedMinMps, spec.speedMaxMps);
  const offered = new Set<number>([low, high]);
  for (const speed of ladder) if (speed >= low && speed <= high) offered.add(speed);
  if (spec.speedTypicalMps >= low && spec.speedTypicalMps <= high) offered.add(spec.speedTypicalMps);
  return [...offered]
    .sort((a, b) => a - b)
    .map((speed) => ({
      speed,
      label: `${speed.toFixed(2)} m/s`,
      pressed: Math.abs(speed - spec.speedTypicalMps) < 1e-9,
    }));
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

export function mountMachinesEditor(
  elements: MachinesEditorElements,
  context: MountContext,
): Panel {
  const doc = elements.rows.ownerDocument;
  let view: ViewAt | undefined;

  let builtRowKeys = '';
  const rowNodes = new Map<string, SliderHandles>();

  const spec = (): MachineSpec | undefined => view?.state.machineSpec;

  function patch(next: Partial<MachineSpec>): void {
    const current = spec();
    if (current === undefined) return;
    context.update({ machineSpec: { ...current, ...next } });
  }

  elements.name.addEventListener('input', () => {
    patch({ name: elements.name.value });
  });

  elements.close.addEventListener('click', () => {
    context.openTab('run');
  });

  elements.save.addEventListener('click', () => {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return;
    try {
      const saved = at.state.savedClasses;
      const id = nextSavedId('cls', allClasses(at.resources, saved).map((entry) => entry.id));
      const made = classFromSpec(current, id);
      // Parsed before it is kept, so a class the loader would refuse is refused here instead of on
      // the next run, when the reader has lost the thread between the edit and the message.
      parseElevatorSpecs(specsWithClass(at.resources.elevatorSpecs, made) as unknown);
      context.update({
        savedClasses: [...saved, made],
        editingClassId: id,
        machineSpec: specFromClass(made),
      });
      setText(elements.error, '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setText(elements.error, message);
      context.fail(message);
    }
  });

  /* --- the rows ----------------------------------------------------------- */

  function drawRows(rows: readonly MachineRowView[]): void {
    const keys = rows.map((entry) => entry.row.key).join('|');
    if (keys !== builtRowKeys) {
      rowNodes.clear();
      fill(
        elements.rows,
        ...rows.map((entry) => {
          const node = slider(doc, {
            label: entry.row.label,
            value: entry.value,
            raw: entry.raw,
            min: entry.row.min,
            max: entry.row.max,
            step: entry.row.step,
            heading: entry.heading,
            sub: entry.field,
            help: entry.row.help,
            onInput: (raw) => {
              patch(machinePatchFor(entry.row.key, raw));
            },
          });
          const handles = sliderHandlesOf(node);
          if (handles !== undefined) rowNodes.set(entry.row.key, handles);
          return node;
        }),
      );
      builtRowKeys = keys;
    }
    for (const entry of rows) {
      const handles = rowNodes.get(entry.row.key);
      if (handles === undefined) continue;
      updateSliderRow(handles, {
        raw: entry.raw,
        value: entry.value,
        sub: entry.field,
        subColor: 'var(--faint)',
        labelColor: 'var(--text)',
      });
    }
  }

  /* --- render ------------------------------------------------------------- */

  function render(at: ViewAt): void {
    view = at;
    const state = at.state;
    const current = state.machineSpec;
    const source: MachineClass | undefined = classById(
      at.resources,
      state.savedClasses,
      state.editingClassId,
    );

    setText(elements.editing, `Editing — ${current.name}`);
    if (elements.name.value !== current.name) elements.name.value = current.name;

    drawRows(machineRowsOf(current));

    fill(
      elements.speedChips,
      chipRow(
        doc,
        ratedSpeedChipsOf(current, speedLadderOf(at.resources.elevatorSpecs)).map((entry) => ({
          label: entry.label,
          selected: entry.pressed,
          title:
            `Sets ratedSpeedMps.typical to ${entry.label}. On a short rise it is never reached, ` +
            'so door and stop time dominate and this does less than it looks like it should.',
          onPick: () => {
            patch({ speedTypicalMps: entry.speed });
          },
        })),
      ),
    );

    setText(elements.summary, machineSummary(current));
    setHidden(elements.dirty, source === undefined || !machineIsDirty(current, source));

    /*
     * Validate live, so a band the loader would refuse is named while the reader is dragging rather
     * than after they press save. `classFromSpec` already sorts the min/max pair and clamps the
     * typical into it, so most of what could go wrong here has been fixed on the way through — what
     * is left is what the parser alone can see.
     */
    try {
      const preview = classFromSpec(current, state.editingClassId);
      parseElevatorSpecs(specsWithClass(at.resources.elevatorSpecs, preview) as unknown);
      setText(elements.error, '');
    } catch (error) {
      setText(elements.error, error instanceof Error ? error.message : String(error));
    }
  }

  return { render };
}
