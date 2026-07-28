#!/usr/bin/env node
/**
 * `@elevator-sim/cli` — the human entry point.
 *
 * Argument parsing, config loading and run/sweep invocation live here. Wall-clock time and
 * process I/O are allowed in this package; they are not allowed in `@elevator-sim/core`.
 *
 * Five commands, and one rule that runs through all of them: **every command that simulates
 * prints the seed it used**. CLAUDE.md invariant 5 says every persisted run record carries its
 * seed so that any run replays exactly; a CLI that produced an interesting number you could not
 * reproduce would honour the letter of that and none of its point.
 *
 * Exit codes: `0` success, `1` the user asked for something impossible, `2` the simulator itself
 * failed. Nothing here depends on a third-party package — argument parsing is hand-rolled and
 * colour is raw ANSI — so the install is trivial and the surface is auditable.
 *
 * Two things about the plumbing, both because this is a discovery tool people pipe:
 *
 * - **Results go to stdout, diagnostics go to stderr.** `run … > results.txt` must put the run in
 *   the file and the error on the screen, not the other way round.
 * - **A closed stdout is not a crash.** `list | head -2` closes the pipe after two lines; the
 *   guard turns the resulting EPIPE into a clean exit rather than a twenty-line Node stack.
 */

import { pathToFileURL } from 'node:url';

import { ConfigError, TrafficError } from '@elevator-sim/core';

import { compareCommand, COMPARE_HELP } from './commands/compare.js';
import { listCommand, LIST_HELP } from './commands/list.js';
import { runCommand, RUN_HELP } from './commands/run.js';
import { tuneCommand, TUNE_HELP } from './commands/tune.js';
import { watchCommand, WATCH_HELP } from './commands/watch.js';
import { EXIT_INTERNAL, EXIT_USAGE, UsageError, didYouMean } from './errors.js';
import { BINARY, printCommandHelp, printRootHelp, type CommandHelp } from './help.js';
import { createOutput, type Output } from './output.js';

export { colorEnabled, createPalette } from './ansi.js';
export {
  booleanFlag,
  numberFlag,
  parseArgs,
  requiredStringFlag,
  stringFlag,
  type FlagSpec,
  type ParsedArgs,
} from './args.js';
export * from './format.js';
export { EXIT_INTERNAL, EXIT_USAGE, UsageError } from './errors.js';
export { createBufferedOutput, createOutput, type Output } from './output.js';
export { listCommand, LIST_FLAGS, printList, summariseWeights } from './commands/list.js';
export { runCommand, RUN_FLAGS, planRun, printRunReport, type RunPlan } from './commands/run.js';
export { compareCommand, COMPARE_FLAGS, runCompare, verdictOf, type Verdict } from './commands/compare.js';
export { watchCommand, WATCH_FLAGS, layoutFor, rowFor } from './commands/watch.js';
export {
  tuneCommand,
  TUNE_FLAGS,
  finalistsOf,
  headlineOf,
  ladderFrom,
  narrowedSpace,
  replicationsToResolveEffect,
  resolutionAt,
  runTune,
} from './commands/tune.js';

const VERSION = '0.0.0';

type Handler = (out: Output, argv: readonly string[], errOut: Output) => Promise<number>;

const COMMANDS: ReadonlyMap<string, { readonly help: CommandHelp; readonly run: Handler }> =
  new Map([
    ['list', { help: LIST_HELP, run: listCommand }],
    ['run', { help: RUN_HELP, run: runCommand }],
    ['compare', { help: COMPARE_HELP, run: compareCommand }],
    ['tune', { help: TUNE_HELP, run: tuneCommand }],
    ['watch', { help: WATCH_HELP, run: watchCommand }],
  ]);

const HELP_ORDER: readonly CommandHelp[] = [
  LIST_HELP,
  RUN_HELP,
  COMPARE_HELP,
  TUNE_HELP,
  WATCH_HELP,
];

/**
 * Run the CLI.
 *
 * Exported so tests can drive it with an argv array and a buffered output rather than by
 * spawning a process. Returns the exit code; it never calls `process.exit`.
 */
export async function main(
  argv: readonly string[],
  out: Output = createOutput(process.stdout, { color: !argv.includes('--no-color') }),
  errOut: Output = out,
): Promise<number> {
  const hoisted = hoistGlobalFlags(argv);
  const [first, ...tail] = hoisted.argv;
  // Leading globals are re-inserted ahead of the command's own arguments rather than after, so
  // that `--data a list --data b` still ends with b: the parser takes the last occurrence, and a
  // flag typed after the command should beat one typed before it.
  const rest = [...hoisted.globals, ...tail];

  if (first === undefined || first === '--help' || first === '-h' || first === 'help') {
    printRootHelp(out, HELP_ORDER);
    return 0;
  }
  if (first === '--version' || first === '-v') {
    out.line(VERSION);
    return 0;
  }

  const command = COMMANDS.get(first);
  if (command === undefined) {
    reportUsage(errOut, unknownCommand(first));
    return EXIT_USAGE;
  }

  // Help is answered before the flags are validated. `compare --help` must work without also
  // supplying --building, --a and --b: a user asking what the flags are does not yet know them.
  if (rest.includes('--help') || rest.includes('-h')) {
    printCommandHelp(out, command.help);
    return 0;
  }

  try {
    return await command.run(out, rest, errOut);
  } catch (error) {
    const usage = asUsageError(error);
    if (usage !== undefined) {
      reportUsage(errOut, usage);
      return EXIT_USAGE;
    }
    reportInternal(errOut, error, first);
    return EXIT_INTERNAL;
  }
}

/* -------------------------------------------------------------------------- *
 * Global flags
 * -------------------------------------------------------------------------- */

/**
 * The flags that mean the same thing wherever they appear, and whether each takes a value.
 *
 * Every command declares these itself; what this map adds is permission to type them *before*
 * the command. `--help` advertised them under a heading called "Global flags", and a global flag
 * that is rejected in the leading position — with "unknown command", pointing at the wrong thing
 * entirely — is the help text teaching a usage that does not work.
 */
const GLOBAL_FLAGS: ReadonlyMap<string, boolean> = new Map([
  ['--data', true],
  ['--no-color', false],
]);

/**
 * Split a leading run of global flags off the front of `argv`.
 *
 * Only a *leading* run is taken, and only flags in {@link GLOBAL_FLAGS}: the first token that is
 * not one of them is the command, and everything from there on belongs to the command's own
 * parser. `elevator-sim run --data ./x` is untouched by this.
 */
export function hoistGlobalFlags(argv: readonly string[]): {
  readonly argv: readonly string[];
  readonly globals: readonly string[];
} {
  const globals: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) break;
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    const takesValue = GLOBAL_FLAGS.get(name);
    if (takesValue === undefined) break;

    if (!takesValue || equals !== -1) {
      globals.push(token);
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    // A dangling `--data` with nothing after it is still consumed, so the message the user gets
    // is about the missing directory rather than about an unknown command.
    if (value === undefined) {
      globals.push(token);
      index += 1;
      break;
    }
    globals.push(token, value);
    index += 2;
  }
  return { argv: argv.slice(index), globals };
}

/**
 * The error for a first argument that is not a command.
 *
 * A leading `-` is its own diagnosis: the flag is very likely fine and the *position* is not, so
 * saying "unknown command" would send the user looking for a typo that is not there.
 */
function unknownCommand(first: string): UsageError {
  const known = [...COMMANDS.keys()];
  if (first.startsWith('-')) {
    return new UsageError(`${BINARY}: "${first}" is a flag, and flags come after the command.`, [
      `try: ${BINARY} ${known[0] ?? 'list'} ${first}`,
      `only ${[...GLOBAL_FLAGS.keys()].join(', ')} and --help/--version may come first`,
      `commands: ${known.join(', ')}`,
    ]);
  }
  const suggestion = didYouMean(first, known);
  return new UsageError(`${BINARY}: unknown command "${first}".`, [
    `commands: ${known.join(', ')}`,
    ...(suggestion === undefined ? [] : [`did you mean "${suggestion}"?`]),
    `run \`${BINARY} --help\` for the full list`,
  ]);
}

/**
 * Which failures are the user's fault.
 *
 * `TrafficError` and `ConfigError` are raised while a run is being *set up* — a 120 s horizon
 * that cannot hold a 300 s peak, a demand template that rejects an override — and every one of
 * them traces back to something typed on the command line. Reporting them as internal errors
 * with exit code 2 would blame the simulator for a `--duration` that was too short.
 *
 * `SimulationError` is deliberately *not* here: it means a run refused to report itself, which
 * is the simulator declining to hand back a number, and exit code 2 is exactly right for that.
 */
function asUsageError(error: unknown): UsageError | undefined {
  if (error instanceof UsageError) return error;
  if (error instanceof TrafficError || error instanceof ConfigError) {
    return new UsageError(`this configuration cannot be simulated.`, [
      error.message,
      'the flags that shape a run are --duration, --rate, --template, --traffic and --window',
    ]);
  }
  return undefined;
}

function reportUsage(out: Output, error: UsageError): void {
  const { red, dim, bold } = out.palette;
  out.line();
  out.line(`${red(bold('error'))}  ${error.message}`);
  for (const detail of error.details) out.line(dim(`       ${detail}`));
  out.line();
}

function reportInternal(out: Output, error: unknown, command: string): void {
  const { red, dim, bold } = out.palette;
  const message = error instanceof Error ? error.message : String(error);
  out.line();
  out.line(`${red(bold('internal error'))}  ${BINARY} ${command} failed.`);
  out.line(dim(`       ${message}`));
  if (error instanceof Error && error.stack !== undefined && process.env['ELEVATOR_SIM_DEBUG']) {
    out.line(dim(error.stack));
  } else {
    out.line(dim('       set ELEVATOR_SIM_DEBUG=1 for a stack trace'));
  }
  out.line();
}

/* -------------------------------------------------------------------------- *
 * Process entry
 * -------------------------------------------------------------------------- */

/** `true` when this module is the script Node was started with, rather than an import. */
function isEntryPoint(): boolean {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(script).href;
  } catch {
    return false;
  }
}

/** The part of a stream this guard needs. Narrow enough that a test can supply its own. */
export interface ErrorEmitter {
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
}

/**
 * Make a closed output pipe an ordinary end, not a crash.
 *
 * `elevator-sim list | head -2` closes stdout after two lines. Node does not die on SIGPIPE the
 * way a C program does; it raises an `EPIPE` error event on the stream, and a stream with no
 * `error` listener rethrows it as an unhandled event — twenty lines of internal stack trace on a
 * command that did exactly what was asked of it. `list` is sixty lines long and this is a
 * discovery tool, so piping it to `head` or to `less` is the normal case, not an edge one.
 *
 * Exit `0`: the reader went away, which is not this program's failure. Anything that is not a
 * broken pipe is rethrown, because a genuinely failing stdout should still be loud.
 */
export function guardBrokenPipe(
  streams: readonly ErrorEmitter[],
  exit: (code: number) => void,
): void {
  for (const stream of streams) {
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
        exit(0);
        return;
      }
      throw error;
    });
  }
}

if (isEntryPoint()) {
  guardBrokenPipe([process.stdout, process.stderr], (code) => {
    process.exit(code);
  });

  // Results on stdout, diagnostics on stderr. Without the second stream every error message
  // lands in the file behind `> results.txt` and the terminal shows nothing at all.
  const color = !process.argv.includes('--no-color');
  void main(
    process.argv.slice(2),
    createOutput(process.stdout, { color }),
    createOutput(process.stderr, { color }),
  ).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exitCode = EXIT_INTERNAL;
    },
  );
}
