/**
 * Raw ANSI, hand-rolled.
 *
 * No `chalk`, no `ink`. Colour is applied only when the destination is a TTY and `NO_COLOR` is
 * unset (https://no-color.org), so piping any command to a file produces clean text.
 *
 * Every escape sequence is built from `String.fromCharCode(27)` rather than a literal control
 * character, so nothing in this file is invisible in an editor or mangled by a copy-paste.
 */

/** `ESC [` — the Control Sequence Introducer. */
const CSI = `${String.fromCharCode(27)}[`;

/** A style is a function of a string, so a disabled palette is the identity function. */
export type Style = (text: string) => string;

export interface Palette {
  readonly enabled: boolean;
  readonly bold: Style;
  readonly dim: Style;
  readonly red: Style;
  readonly green: Style;
  readonly yellow: Style;
  readonly blue: Style;
  readonly magenta: Style;
  readonly cyan: Style;
  readonly inverse: Style;
}

export interface ColorOptions {
  /** `false` forces colour off — the `--no-color` flag. */
  readonly requested?: boolean | undefined;
  readonly isTTY?: boolean | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** Whether to emit escape codes at all. `NO_COLOR` wins over everything except `FORCE_COLOR`. */
export function colorEnabled(options: ColorOptions = {}): boolean {
  const env = options.env ?? process.env;
  if (options.requested === false) return false;
  const forced = env['FORCE_COLOR'];
  if (forced !== undefined && forced !== '' && forced !== '0') return true;
  const noColor = env['NO_COLOR'];
  if (noColor !== undefined && noColor !== '') return false;
  if (env['TERM'] === 'dumb') return false;
  return options.isTTY === true;
}

const identity: Style = (text) => text;

function wrap(open: string, close: string): Style {
  return (text) => `${CSI}${open}m${text}${CSI}${close}m`;
}

/** Build a palette. Every style is the identity function when colour is off. */
export function createPalette(enabled: boolean): Palette {
  if (!enabled) {
    return {
      enabled: false,
      bold: identity,
      dim: identity,
      red: identity,
      green: identity,
      yellow: identity,
      blue: identity,
      magenta: identity,
      cyan: identity,
      inverse: identity,
    };
  }
  return {
    enabled: true,
    bold: wrap('1', '22'),
    dim: wrap('2', '22'),
    red: wrap('31', '39'),
    green: wrap('32', '39'),
    yellow: wrap('33', '39'),
    blue: wrap('34', '39'),
    magenta: wrap('35', '39'),
    cyan: wrap('36', '39'),
    inverse: wrap('7', '27'),
  };
}

/* -------------------------------------------------------------------------- *
 * Screen control — used by `watch` only, and only on a TTY.
 * -------------------------------------------------------------------------- */

export const CURSOR_HIDE = `${CSI}?25l`;
export const CURSOR_SHOW = `${CSI}?25h`;
export const CLEAR_SCREEN = `${CSI}2J${CSI}H`;
export const CURSOR_HOME = `${CSI}H`;

/** Erase from the cursor to the end of the line. Keeps a redraw from leaving debris. */
export const CLEAR_LINE = `${CSI}K`;

/** Move the cursor to a 1-based row and column. */
export function moveTo(row: number, column: number): string {
  return `${CSI}${row};${column}H`;
}

/** Matches one CSI sequence. Built at runtime so no control character appears in source. */
const CSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

/** The visible text, with every escape sequence removed. */
export function stripAnsi(text: string): string {
  return text.replace(CSI_PATTERN, '');
}

/** Strip escape codes, so padding can be computed on what the user actually sees. */
export function plainLength(text: string): number {
  return stripAnsi(text).length;
}

/** Pad to `width` using the visible length, so a styled cell still lines up. */
export function padEnd(text: string, width: number): string {
  const gap = width - plainLength(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

/** Right-align to `width` using the visible length. */
export function padStart(text: string, width: number): string {
  const gap = width - plainLength(text);
  return gap > 0 ? ' '.repeat(gap) + text : text;
}
