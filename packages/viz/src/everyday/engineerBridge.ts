/**
 * **The Engineer settings, reachable from Everyday Mode** — the seam that keeps the two Motion
 * switches from being two switches.
 *
 * ## The rule this exists to satisfy
 *
 * GAMEPLAY § 15.1 gives the Everyday settings screen a Motion row, and the Engineer menu already
 * has one: `menu/screens.ts`'s `settings.reduce-motion` toggle, whose value lives in
 * `dev/main.ts`'s `menuState.settings.reduceMotion`, is applied by `dev/motion.ts`'s
 * `shouldAutoplayWith` (the OS-or-menu OR rule) and by the immediate `playback?.pause()` in
 * `dispatchMenu`, and is persisted through `persist/session.ts`'s envelope
 * (`persist/validate.ts`'s `SETTINGS_CHECKS`). A second `reduceMotion` field for Everyday Mode
 * would be two answers to one question — a player who reduced motion on one surface and not the
 * other would be *right on both screens and ignored on one* — so the Everyday row does not hold a
 * value at all. It reads and writes the Engineer one, through this bridge, and the write lands in
 * `dispatchMenu` as the **same** `set-setting` intent the Engineer toggle dispatches. Same
 * reducer, same persistence, same immediate application; the two surfaces cannot disagree because
 * there is nothing held twice to disagree about.
 *
 * ## Why a provided port rather than an import
 *
 * `dev/main.ts` holds `menuState` as a local inside an async boot, exports no accessor to it, and
 * an Everyday module importing `dev/main.js` for one closure would be importing a module whose
 * side effect is *the whole application*. So the dependency points the way it already points for
 * `EVERYDAY_ROOT_CLASS`: `dev/main.ts` imports this module and **provides** the port when its
 * boot reaches the menu state; the settings screen consumes whatever has been provided.
 *
 * ## The window where nothing is provided, said rather than hidden
 *
 * `dev/main.ts` boots asynchronously — resources load before `boot()` runs — and the Everyday
 * shell mounts immediately, so a player can reach the settings screen before the port exists.
 * {@link engineerSettings} answers `undefined` then, the screen draws the row's *absence* (never
 * a dead toggle — GAMEPLAY § 20.12), and {@link onEngineerSettingsProvided} is how the screen
 * hears the port arrive and puts the real row up. The same shape `everyday/boot.ts` uses for the
 * Engineer menu's late arrival, one seam over.
 */

/** What the Everyday settings screen may do to the Engineer settings. Narrow on purpose. */
export interface EngineerSettingsBridge {
  /** The current value of `menuState.settings.reduceMotion`. */
  reduceMotion(): boolean;
  /**
   * Dispatch the same `set-setting` intent the Engineer menu's own toggle dispatches — through
   * `dispatchMenu`, so the application (`playback?.pause()`) and the save (`saveSessionNow()`)
   * both happen exactly as they would from that menu.
   */
  setReduceMotion(value: boolean): void;
}

let provided: EngineerSettingsBridge | undefined;

const listeners = new Set<() => void>();

/**
 * `dev/main.ts#boot` is the one intended caller, once, when `menuState` exists. Calling it again
 * replaces the port (a re-boot is a new menu state) and re-notifies, which is the behaviour a
 * listener that survived a re-mount would want.
 */
export function provideEngineerSettings(bridge: EngineerSettingsBridge): void {
  provided = bridge;
  for (const listener of [...listeners]) listener();
}

/** The port, or `undefined` while the Engineer surface is still booting. */
export function engineerSettings(): EngineerSettingsBridge | undefined {
  return provided;
}

/**
 * Hear the port arrive. Returns the unsubscribe, which the settings screen calls on unmount so a
 * navigated-away screen does not redraw into a region something else now owns.
 */
export function onEngineerSettingsProvided(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
