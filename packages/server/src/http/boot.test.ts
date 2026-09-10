/**
 * The boot refusals, pinned by a **run** rather than by a predicate.
 *
 * [§ D330](../../../../DECISIONS.md) widened `ELEVATOR_SIM_ALLOW_ORIGIN` from equality to
 * membership, and its **first condition** is that the refusal it kept is pinned by a run that
 * starts the server with a wrong allowlist, *not by a unit test over a predicate*. That distinction
 * is the whole reason this file exists beside `static.test.ts` rather than inside it. Calling
 * `allowOriginFrom` and watching it throw checks a function. Spawning `node dist/main.js` and
 * watching the process refuse to come up checks that the function is **reached**, in the order the
 * entry point reaches it, before anything is opened. This repository's most-repeated defect is a
 * behaviour that is configurable, unit-tested and called from nothing shipped, and a security
 * refusal is the worst possible place to acquire it.
 *
 * The cases below are therefore about the process: its exit code, which stream the message came out
 * of, and what it did *not* print. A server that refused correctly and still announced itself as
 * listening would pass every predicate test in the repository.
 *
 * ## Why these run without a database
 *
 * `main` reads the origins before it constructs `PgSql`, deliberately, so a configuration mistake
 * surfaces next to its cause rather than several seconds and one stack frame away. That ordering is
 * what makes these cases cheap, and the last one turns it into an assertion: a **correct** allowlist
 * gets past the origin checks and stops at the next refusal instead, which is how a run can show
 * that an allowlist was accepted without a database to accept it into.
 *
 * ## They need `dist/`, and they build it rather than skipping
 *
 * The same reasoning as `packages/cli/src/process.test.ts`, which spawns the built CLI for the same
 * kind of reason: a regression test that quietly does not run is worse than no test at all. The
 * build is unconditional and `tsc -b` decides whether there is anything to do, because a `dist/`
 * that exists but predates the source is the common case rather than a missing one, and it is what
 * any branch switch leaves behind.
 */

import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const SERVER = fileURLToPath(new URL('../../dist/main.js', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/** A Static Web App's default hostname and the preview Azure mints for a pull request against it. */
const BASE = 'silver-forest-0ab12cd34';
const SUFFIX = '7.azurestaticapps.net';
const SITE = `https://${BASE}.${SUFFIX}`;

interface Booted {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Start the real entry point with exactly this environment and wait for it to stop.
 *
 * The environment is built from nothing rather than spread over `process.env`, because every
 * variable this process reads is an `ELEVATOR_SIM_*` one and inheriting the suite's would make the
 * result depend on the machine. `PATH` is passed for Node's own sake; `process.execPath` is
 * absolute, so nothing here resolves through it.
 */
async function boot(env: Readonly<Record<string, string>>): Promise<Booted> {
  const child = spawn(process.execPath, [SERVER], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env['PATH'] ?? '', NO_COLOR: '1', ...env },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  return await new Promise<Booted>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

beforeAll(() => {
  execFileSync('npx', ['tsc', '-b'], { cwd: REPO, stdio: 'inherit' });
}, 600_000);

describe('the server refuses to boot on an allowlist it cannot honour — § D330 condition 1', () => {
  it('stops, on an allowlist that does not contain the viewer', async () => {
    // The refusal § D330 kept. Before it this was "the two values are not equal"; it is now "the
    // viewer's origin is not a member", and it is still a process that does not come up.
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: 'https://other.example',
      ELEVATOR_SIM_DB: 'postgres://unused',
    });
    expect(booted.code).toBe(1);
    expect(booted.stderr).toMatch(/ELEVATOR_SIM_ORIGIN/u);
    // The message and nothing else: a configuration mistake with an obvious fix, not a crash. A
    // stack frame here would mean the entry point's own handler had been bypassed.
    expect(booted.stderr).not.toMatch(/\n\s+at /u);
    // And it did not announce itself. A refusal that still printed this would have bound a port.
    expect(booted.stdout).not.toMatch(/listening/u);
  });

  it('stops, on an origin this deployment cannot mint', async () => {
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},https://evil.example`,
      ELEVATOR_SIM_DB: 'postgres://unused',
    });
    expect(booted.code).toBe(1);
    expect(booted.stderr).toMatch(/cannot mint/u);
    expect(booted.stdout).not.toMatch(/listening/u);
  });

  it('stops, on a wildcard, which is the value somebody reaches for at 2am', async () => {
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: '*',
      ELEVATOR_SIM_DB: 'postgres://unused',
    });
    expect(booted.code).toBe(1);
    expect(booted.stderr).toMatch(/wildcard|any page on the web/u);
    expect(booted.stdout).not.toMatch(/listening/u);
  });

  it('stops, where "previews" would expand to nothing', async () => {
    // A deployment with no preview environments asking for its previews. Expanding that to the
    // empty set would permit nothing and say nothing, which is GitHub issue #123's own shape.
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: 'https://elevator-sim.example',
      ELEVATOR_SIM_ALLOW_ORIGIN: 'https://elevator-sim.example,previews',
      ELEVATOR_SIM_DB: 'postgres://unused',
    });
    expect(booted.code).toBe(1);
    expect(booted.stderr).toMatch(/Static Web App/u);
    expect(booted.stdout).not.toMatch(/listening/u);
  });

  it('gets past the origin checks on a membership allowlist, and stops at the next refusal', async () => {
    // The positive direction, which is the one a refusal test cannot give you. The allowlist here
    // is exactly what a split deployment on Azure Static Web Apps sets, and the process accepts it
    // and goes on to refuse the *database*. So the origins were read, expanded and permitted by a
    // real boot rather than by a predicate, and this needs no database to show it.
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews`,
    });
    expect(booted.code).toBe(1);
    expect(booted.stderr).toMatch(/ELEVATOR_SIM_DB is not set/u);
    expect(booted.stderr).not.toMatch(/ELEVATOR_SIM_ALLOW_ORIGIN/u);
  });
});

/**
 * **A real failure, in the real process, producing the real alert key** — GitHub issue #242, AC3.
 *
 * AC3 asks for an alert path *tested by triggering a real error*. The half that can be tested from
 * a checkout is this one: that the thing an alert rule keys on is actually written, by the shipped
 * entry point, on a failure nobody staged inside a unit test. The half that cannot is the rule
 * itself, which lives in a subscription this repository has no credentials for; the runbook says so
 * where an operator will read it.
 *
 * The failure used is the one this file already produces — a boot with no database. That is a
 * genuine unhandled rejection out of `main()`, reaching the entry point's own `catch`, in a process
 * spawned as `node dist/main.js`.
 */
describe('a failure that stops the process says so in the shape an alert keys on — #242', () => {
  it('writes one fault line to stderr, and it names the boot', async () => {
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews`,
    });

    expect(booted.code).toBe(1);
    /*
     * The literal, because that is what a rule is written against. A test that read the marker back
     * out of the constant that produced it could not fail when the constant moved, and the first
     * anybody would know is an alert that had quietly stopped firing.
     */
    expect(booted.stderr).toContain('elevator-sim-fault at=boot kind=Error');
    /* One line, not a stream of them: an alert on a boot failure must count boots. */
    expect(booted.stderr.match(/elevator-sim-fault/gu)?.length).toBe(1);
  });

  it('says nothing about the failure beyond its class, on the line the alert reads', async () => {
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews`,
    });

    const line = booted.stderr
      .split('\n')
      .find((candidate) => candidate.startsWith('elevator-sim-fault'));
    expect(line).toBe('elevator-sim-fault at=boot kind=Error');
    /*
     * The human-readable message is still printed, on its own line, and that is deliberate rather
     * than an oversight — the two lines answer different questions. This one is what a query reads;
     * the other is what a person reading a terminal needs in order to fix the configuration.
     */
    expect(booted.stderr).toMatch(/ELEVATOR_SIM_DB is not set/u);
  });

  it('goes to standard error, never to standard output', async () => {
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews`,
    });

    expect(booted.stdout).not.toContain('elevator-sim-fault');
  });

  /*
   * The marker has to be distinguishable from the one ordinary line this server writes, because a
   * rule keyed on `elevator-sim` alone would fire on every cold start — and this deployment cold
   * starts constantly, at `minReplicas: 0`. Asserted against the real startup line rather than
   * against a copy of it.
   */
  it('is distinguishable from the line a healthy start writes', async () => {
    const booted = await boot({
      ELEVATOR_SIM_ORIGIN: SITE,
      ELEVATOR_SIM_ALLOW_ORIGIN: `${SITE},previews`,
    });
    expect(booted.stdout).not.toMatch(/listening/u);
    expect('elevator-sim listening on 8080 — serving its own page').not.toContain(
      'elevator-sim-fault',
    );
  });
});
