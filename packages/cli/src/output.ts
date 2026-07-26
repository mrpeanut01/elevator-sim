/**
 * Where output goes.
 *
 * A thin seam over `process.stdout` so every command can be driven by a test that captures its
 * output as a string, and so colour, terminal size and TTY-ness are decided in exactly one
 * place. Process I/O is allowed in this package and forbidden in `@elevator-sim/core`.
 */

import {
  createPalette,
  colorEnabled,
  padEnd,
  padStart,
  plainLength,
  type Palette,
} from './ansi.js';

export interface Output {
  readonly palette: Palette;
  readonly isTTY: boolean;
  readonly columns: number;
  readonly rows: number;
  /** Write a line, terminated. */
  line(text?: string): void;
  /** Write bytes exactly as given — cursor moves, partial frames. */
  raw(text: string): void;
}

export interface OutputOptions {
  /** `false` disables colour regardless of TTY-ness. The `--no-color` flag. */
  readonly color?: boolean | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** Output bound to a real stream. */
export function createOutput(
  stream: NodeJS.WriteStream = process.stdout,
  options: OutputOptions = {},
): Output {
  const isTTY = stream.isTTY === true;
  const palette = createPalette(
    colorEnabled({
      ...(options.color === undefined ? {} : { requested: options.color }),
      isTTY,
      ...(options.env === undefined ? {} : { env: options.env }),
    }),
  );
  return {
    palette,
    isTTY,
    // A stream can report `0` as well as `undefined` — a pty whose size was never negotiated —
    // and a zero-width terminal would turn every `repeat()` into a RangeError.
    get columns(): number {
      const columns = stream.columns;
      return columns === undefined || columns <= 0 ? 100 : columns;
    },
    get rows(): number {
      const rows = stream.rows;
      return rows === undefined || rows <= 0 ? 40 : rows;
    },
    line(text = ''): void {
      stream.write(`${text}\n`);
    },
    raw(text: string): void {
      stream.write(text);
    },
  };
}

/** Output collected into a string. For tests, and for nothing else. */
export interface BufferedOutput extends Output {
  text(): string;
}

export function createBufferedOutput(
  options: OutputOptions & { readonly columns?: number; readonly rows?: number } = {},
): BufferedOutput {
  const chunks: string[] = [];
  const palette = createPalette(
    colorEnabled({
      ...(options.color === undefined ? {} : { requested: options.color }),
      isTTY: false,
      env: options.env ?? {},
    }),
  );
  return {
    palette,
    isTTY: false,
    columns: options.columns ?? 100,
    rows: options.rows ?? 40,
    line(text = ''): void {
      chunks.push(`${text}\n`);
    },
    raw(text: string): void {
      chunks.push(text);
    },
    text(): string {
      return chunks.join('');
    },
  };
}

/* -------------------------------------------------------------------------- *
 * Small layout helpers. Padding is computed on the *visible* length, so a
 * styled cell still lines up with an unstyled one.
 * -------------------------------------------------------------------------- */

export type Align = 'left' | 'right';

export interface Column {
  readonly header: string;
  readonly align?: Align | undefined;
}

/** Render a table: header row, then rows, columns sized to their widest visible cell. */
export function table(
  out: Output,
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
  indent = '  ',
): void {
  const widths = columns.map((column, index) => {
    let width = column.header.length;
    for (const row of rows) {
      const cell = row[index] ?? '';
      width = Math.max(width, plainLength(cell));
    }
    return width;
  });

  const header = columns
    .map((column, index) =>
      align(column.header, widths[index] ?? 0, column.align ?? 'left'),
    )
    .join('  ')
    .trimEnd();
  out.line(indent + out.palette.dim(header));

  for (const row of rows) {
    const line = columns
      .map((column, index) => align(row[index] ?? '', widths[index] ?? 0, column.align ?? 'left'))
      .join('  ')
      .trimEnd();
    out.line(indent + line);
  }
}

function align(text: string, width: number, how: Align): string {
  return how === 'right' ? padStart(text, width) : padEnd(text, width);
}

/** Pad a cell to `width` on its visible length. Re-exported name for call-site readability. */
export function padColumn(text: string, width: number): string {
  return padEnd(text, width);
}

/** A section heading with a rule under it, sized to the terminal. */
export function heading(out: Output, text: string): void {
  out.line();
  out.line(out.palette.bold(text));
  const width = Math.max(1, Math.min(Math.max(text.length, 20), out.columns - 1));
  out.line(out.palette.dim('─'.repeat(width)));
}

/** A `label   value` pair with the labels aligned. */
export function field(out: Output, label: string, value: string, width = 16): void {
  out.line(`  ${out.palette.dim(padEnd(label, width))}${value}`);
}
