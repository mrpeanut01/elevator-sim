#!/usr/bin/env node
/**
 * Refresh `infra/checks/test-durations.json` from the logs of finished CI runs.
 *
 *     node scripts/test-durations.mjs <run id> [<run id> ...]
 *
 * `infra/checks/testSequencer.mjs` splits a sharded leg by these weights instead of by file count,
 * and starts the slowest file first. The weights only have to be roughly right: a file missing from
 * the table is weighed at its project's median, so a stale table makes the shards less even, never
 * wrong. Refresh it when a leg's shards drift apart by more than a couple of minutes.
 *
 * Each run's per-file durations are read from vitest's default reporter in the job logs (`gh run
 * view --log`), and a file seen in several runs is given the mean. Needs `gh` signed in to an
 * account that can read the repository's Actions logs.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const OUT = fileURLToPath(new URL('../infra/checks/test-durations.json', import.meta.url));

/* eslint-disable-next-line no-control-regex -- the logs carry the reporter's colour codes */
const ANSI = /\u001b\[[0-9;]*m|\^\[\[[0-9;]*m/gu;

/**
 * One file's line from vitest's default reporter, e.g.
 * `✓ viz-browser src/everyday/shell.browser.test.ts (17 tests) 96049ms`. The project label comes
 * first and the path is relative to that project's root.
 */
const FILE_LINE = /[✓❯×↓]\s+([a-z][a-z-]*)\s+(src\/\S+\.test\.ts)\s+\(\d+ tests?[^)]*\)\s+(\d+)ms\s*$/u;

/** `project:path-from-repo-root` → seconds, from one job's log text. */
export function durationsInLog(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.replace(ANSI, '');
    const match = FILE_LINE.exec(line);
    if (match === null) continue;
    const [, project, path, ms] = match;
    out.set(`${project}:packages/${packageOf(project)}/${path}`, Number(ms) / 1000);
  }
  return out;
}

/** `viz-browser` lives in `packages/viz`; every other project is named after its package. */
const packageOf = (project) => project.replace(/-browser$/u, '');

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

function main(runIds) {
  if (runIds.length === 0) {
    console.error('usage: node scripts/test-durations.mjs <run id> [<run id> ...]');
    process.exit(2);
  }
  const samples = new Map();
  for (const run of runIds) {
    const jobs = JSON.parse(gh(['run', 'view', run, '--json', 'jobs'])).jobs;
    for (const job of jobs) {
      const found = durationsInLog(gh(['run', 'view', '--job', String(job.databaseId), '--log']));
      for (const [key, seconds] of found) samples.set(key, [...(samples.get(key) ?? []), seconds]);
    }
  }
  if (samples.size === 0) {
    console.error('no per-file durations found in those runs; is the default reporter still on?');
    process.exit(1);
  }
  const seconds = Object.fromEntries(
    [...samples]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, values]) => [key, Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10]),
  );
  writeFileSync(OUT, `${JSON.stringify({ runs: runIds, seconds }, null, 2)}\n`);
  console.log(`wrote ${String(samples.size)} files' durations from ${String(runIds.length)} run(s) to ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
