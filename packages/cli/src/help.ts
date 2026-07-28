/**
 * `--help`, top level and per command.
 *
 * The flag table is generated from the same {@link FlagSpec} array the parser validates against,
 * so help and behaviour cannot drift.
 */

import { padEnd } from './ansi.js';
import type { FlagSpec } from './args.js';
import type { Output } from './output.js';

export interface CommandHelp {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  /** Paragraphs printed under the usage line. */
  readonly description?: readonly string[] | undefined;
  readonly flags: readonly FlagSpec[];
  readonly examples?: readonly string[] | undefined;
}

export const BINARY = 'elevator-sim';

export function printCommandHelp(out: Output, help: CommandHelp): void {
  const { bold, dim, cyan } = out.palette;
  out.line();
  out.line(`${bold(`${BINARY} ${help.name}`)} — ${help.summary}`);
  out.line();
  out.line(`  ${cyan(help.usage)}`);
  for (const paragraph of help.description ?? []) {
    out.line();
    out.line(wrap(paragraph, Math.min(out.columns - 2, 92), '  '));
  }

  out.line();
  out.line(bold('Flags'));
  const labels = help.flags.map(
    (flag) =>
      `--${flag.name}${flag.placeholder === undefined ? '' : ` ${flag.placeholder}`}` +
      (flag.aliases === undefined || flag.aliases.length === 0
        ? ''
        : `, -${flag.aliases.join(', -')}`),
  );
  const width = Math.max(...labels.map((label) => label.length), 10);
  for (const [index, flag] of help.flags.entries()) {
    const suffix = describeDefault(flag);
    out.line(
      `  ${cyan(padEnd(labels[index] ?? '', width))}  ${flag.summary}${suffix === undefined ? '' : ` ${dim(suffix)}`}`,
    );
  }

  if (help.examples !== undefined && help.examples.length > 0) {
    out.line();
    out.line(bold('Examples'));
    for (const example of help.examples) out.line(`  ${dim('$')} ${example}`);
  }
  out.line();
}

function describeDefault(flag: FlagSpec): string | undefined {
  if (flag.required === true) return '(required)';
  if (flag.defaultText !== undefined) return `(default: ${flag.defaultText})`;
  if (flag.defaultValue !== undefined) return `(default: ${String(flag.defaultValue)})`;
  return undefined;
}

export function printRootHelp(out: Output, commands: readonly CommandHelp[]): void {
  const { bold, dim, cyan } = out.palette;
  out.line();
  out.line(`${bold('elevator-sim')} — play with the elevator traffic simulator`);
  out.line();
  out.line(`  ${cyan(`${BINARY} <command> [flags]`)}`);
  out.line();
  out.line(bold('Commands'));
  const width = Math.max(...commands.map((command) => command.name.length));
  for (const command of commands) {
    out.line(`  ${cyan(padEnd(command.name, width))}  ${command.summary}`);
  }
  out.line();
  // "Global" has to mean it. These two are accepted on either side of the command, which is what
  // most CLIs do and what this heading promises; the two below are answered before a command is
  // chosen at all, so they say where they go.
  out.line(`${bold('Global flags')}  ${dim('— before or after the command, either works')}`);
  out.line(`  ${cyan(padEnd('--data <dir>', 14))}  data directory (default: the repository's data/)`);
  out.line(`  ${cyan(padEnd('--no-color', 14))}  never emit ANSI colour (NO_COLOR is honoured too)`);
  out.line();
  out.line(bold('On their own'));
  out.line(`  ${cyan(padEnd('--version, -v', 14))}  print the version and exit`);
  out.line(
    `  ${cyan(padEnd('--help, -h', 14))}  print this; after a command, that command's own help`,
  );
  out.line();
  out.line(bold('Start here'));
  out.line(`  ${dim('$')} ${BINARY} list`);
  out.line(`  ${dim('$')} ${BINARY} run --building garden-apartments --dispatcher eta --seed 42`);
  out.line(
    `  ${dim('$')} ${BINARY} compare --building garden-apartments --a eta --b nearest-car --reps 100 --window full-run`,
  );
  out.line(
    `  ${dim('$')} ${BINARY} tune --building garden-apartments --params idle.repositionThresholdS --seed 42`,
  );
  out.line(`  ${dim('$')} ${BINARY} watch --building garden-apartments --dispatcher eta --speed 10`);
  out.line();
  out.line(
    dim('Every command that simulates prints the seed it used. Paste it back with --seed to'),
  );
  out.line(dim('reproduce a run exactly — that is a project invariant, not a convenience.'));
  out.line();
}

/** Wrap `text` to `width`, prefixing every line with `indent`. */
export function wrap(text: string, width: number, indent = ''): string {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= width - indent.length) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines.map((line) => indent + line).join('\n');
}
