/**
 * The things that are only true of a real process.
 *
 * Everything in `cli.test.ts` drives `main` in-process with a buffered output, which is the right
 * way to test what the commands *say*. It cannot test what a closed pipe does, or which of the
 * two real streams a message came out of — both of those are properties of the entry point, and
 * both of them shipped broken. So these tests spawn the built CLI and watch its file descriptors.
 *
 * They need `dist/`, and they build it rather than skipping, because a regression test that quietly
 * does not run is worse than no test at all.
 *
 * ## Missing was never the only way `dist/` can be wrong
 *
 * This used to build only when `dist/index.js` was **absent**. A `dist/` that exists but predates
 * the source is the more common case by far — it is what any branch switch leaves behind — and it
 * made these tests spawn a *stale* CLI and assert against last week's behaviour. On 2026-07-31 that
 * produced 5 failures on a tree whose source was correct, and cost real time to attribute because
 * the failures pointed at the CLI rather than at the build.
 *
 * So the build runs unconditionally and `tsc -b` decides whether there is anything to do. It is
 * incremental and answers exactly that question; on an up-to-date tree it costs a couple of seconds
 * and writes nothing.
 *
 * An mtime comparison — newest `.ts` against the built entry point — was written first and
 * rejected, because it is wrong in both directions. `tsc -b` keys on **content**, not timestamps,
 * so a `git checkout` that rewrites mtimes without changing content leaves the guard permanently
 * convinced the build is stale while `tsc` correctly does nothing: the mtime never advances, and
 * every subsequent run spawns a compiler to no effect. Reimplementing "is this build current?" with
 * `stat` is the same shape of half-correct guard as the `existsSync` check it was meant to replace.
 */

import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { guardBrokenPipe, type ErrorEmitter } from './index.js';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

interface Spawned {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the built CLI. `closeStdoutEarly` destroys the read end after the first chunk. */
async function runCli(
  argv: readonly string[],
  options: { readonly closeStdoutEarly?: boolean } = {},
): Promise<Spawned> {
  const child = spawn(process.execPath, [CLI, ...argv], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  if (options.closeStdoutEarly === true) {
    // Exactly what `| head -2` does: read something, then close the pipe under the writer.
    child.stdout.once('data', () => {
      child.stdout.destroy();
    });
  } else {
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
  }
  return await new Promise<Spawned>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

beforeAll(() => {
  execFileSync('npx', ['tsc', '-b'], { cwd: REPO, stdio: 'inherit' });
}, 600_000);

describe('a stdout pipe that closes early', () => {
  // `list` is sixty lines long, so `elevator-sim list | head` is how anyone would read it. Before
  // the guard this exited 1 with `Error: write EPIPE` and twenty lines of Node internals.
  it('ends list cleanly instead of throwing EPIPE', async () => {
    const { code, stderr } = await runCli(['list', '--no-color'], { closeStdoutEarly: true });
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });

  it('ends run cleanly instead of throwing EPIPE', async () => {
    const { code, stderr } = await runCli(
      ['run', '--building', 'garden-apartments', '--dispatcher', 'eta', '--seed', '3', '--duration', '600'],
      { closeStdoutEarly: true },
    );
    expect(stderr).toBe('');
    expect(code).toBe(0);
  }, 120_000);

  it('ends watch cleanly instead of throwing EPIPE', async () => {
    const { code, stderr } = await runCli(
      ['watch', '--building', 'garden-apartments', '--dispatcher', 'eta', '--seed', '3', '--duration', '600'],
      { closeStdoutEarly: true },
    );
    expect(stderr).toBe('');
    expect(code).toBe(0);
  }, 120_000);
});

describe('guardBrokenPipe', () => {
  /** A stand-in for a stream: enough of an emitter to hand the listener back. */
  function fakeStream(): ErrorEmitter & { fire(error: NodeJS.ErrnoException): void } {
    const listeners: ((error: NodeJS.ErrnoException) => void)[] = [];
    return {
      on(_event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown {
        listeners.push(listener);
        return this;
      },
      fire(error: NodeJS.ErrnoException): void {
        for (const listener of listeners) listener(error);
      },
    };
  }

  it('exits 0 on EPIPE — the reader left, which is not a failure', () => {
    const stream = fakeStream();
    const codes: number[] = [];
    guardBrokenPipe([stream], (code) => codes.push(code));
    stream.fire(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    expect(codes).toEqual([0]);
  });

  it('rethrows anything that is not a broken pipe, so a real stdout failure stays loud', () => {
    const stream = fakeStream();
    const codes: number[] = [];
    guardBrokenPipe([stream], (code) => codes.push(code));
    expect(() => {
      stream.fire(Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }));
    }).toThrow('no space left on device');
    expect(codes).toEqual([]);
  });
});

describe('which stream a message lands on', () => {
  it('sends a usage error to stderr, leaving stdout empty', async () => {
    const { code, stdout, stderr } = await runCli([
      'run',
      '--building',
      'nonexistent',
      '--dispatcher',
      'eta',
    ]);
    expect(code).toBe(1);
    // `run … > results.txt` must not write the error into results.txt.
    expect(stdout).toBe('');
    expect(stderr).toContain('no building with id "nonexistent"');
  });

  it('sends an unknown command to stderr', async () => {
    const { code, stdout, stderr } = await runCli(['compair']);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('did you mean "compare"?');
  });

  it('sends results to stdout, leaving stderr empty', async () => {
    const { code, stdout, stderr } = await runCli(['list', '--no-color']);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('garden-apartments');
  });
});
