/**
 * Undo, redo, dirty state and discard — `UX.md` `ED-21`, `ED-22`, `ED-23`.
 *
 * A stack of whole documents rather than of inverse operations. `ED-21` asks for at least 20
 * steps; a building config is a few kilobytes, so twenty of them is a rounding error next to one
 * recording, and the alternative — an inverse for every operation in `edits.ts` — is a second
 * implementation of every edit, each of which can be wrong in a way only reachable by undoing.
 *
 * ## Dirty is measured, not tracked
 *
 * {@link EditorHistory.isDirty} compares the current document with the one that was *loaded*,
 * not with the previous one. So editing a floor height and editing it back reads as clean, which
 * is what `ED-23`'s "warned before navigation" has to mean if the warning is to stay credible.
 */

import type { BuildingConfig } from '@elevator-sim/core/browser';

/** `ED-21` asks for at least 20. */
export const MIN_HISTORY_DEPTH = 20;
const DEFAULT_DEPTH = 50;

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isDirty: boolean;
  readonly depth: number;
}

export class EditorHistory {
  readonly #limit: number;
  /** The document as loaded. The baseline `isDirty` compares against. */
  #baseline: string;
  #past: BuildingConfig[] = [];
  #future: BuildingConfig[] = [];
  #current: BuildingConfig;

  constructor(initial: BuildingConfig, limit: number = DEFAULT_DEPTH) {
    if (limit < MIN_HISTORY_DEPTH) {
      throw new RangeError(
        `EditorHistory limit ${String(limit)} is below the ${String(MIN_HISTORY_DEPTH)} steps UX.md ED-21 requires.`,
      );
    }
    this.#limit = limit;
    this.#current = initial;
    this.#baseline = JSON.stringify(initial);
  }

  get current(): BuildingConfig {
    return this.#current;
  }

  get state(): HistoryState {
    return {
      canUndo: this.#past.length > 0,
      canRedo: this.#future.length > 0,
      isDirty: JSON.stringify(this.#current) !== this.#baseline,
      depth: this.#past.length,
    };
  }

  /**
   * Record an edit.
   *
   * A no-op edit — one whose result serialises identically — is **not** recorded. Otherwise
   * every keystroke in a text field that ends where it began would consume an undo step, and
   * twenty steps of nothing is the same as no undo at all.
   */
  apply(next: BuildingConfig): BuildingConfig {
    if (JSON.stringify(next) === JSON.stringify(this.#current)) return this.#current;
    this.#past.push(this.#current);
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#future = [];
    this.#current = next;
    return this.#current;
  }

  undo(): BuildingConfig {
    const previous = this.#past.pop();
    if (previous === undefined) return this.#current;
    this.#future.push(this.#current);
    this.#current = previous;
    return this.#current;
  }

  redo(): BuildingConfig {
    const next = this.#future.pop();
    if (next === undefined) return this.#current;
    this.#past.push(this.#current);
    this.#current = next;
    return this.#current;
  }

  /** `ED-22` — back to the loaded document. Itself undoable, because a discard is an edit. */
  discard(): BuildingConfig {
    return this.apply(JSON.parse(this.#baseline) as BuildingConfig);
  }

  /**
   * Adopt a new document as the baseline: a fresh Open, or a successful Save.
   *
   * The parameter is `next`, not `document`. It was `document` for one draft, which shadows the
   * global of that name inside a module that must never touch the DOM — and `boundaries.test.ts`
   * caught it, which is the whole point of having the rule be a grep rather than a convention.
   */
  reset(next: BuildingConfig): BuildingConfig {
    this.#past = [];
    this.#future = [];
    this.#current = next;
    this.#baseline = JSON.stringify(next);
    return this.#current;
  }
}
