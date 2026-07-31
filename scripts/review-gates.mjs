#!/usr/bin/env node
/**
 * The mechanical half of a code review, run on every pull request.
 *
 * ## Why this exists as a gate rather than as a checklist
 *
 * `CLAUDE.md` states eight non-negotiable invariants, and until this file every one of them was
 * enforced by a reader noticing. That is the same failure mode `§ D196`/`§ D201` cost this
 * repository a wave to unpick: a rule nothing executes is a rule that holds until it doesn't, and
 * the discovery is always downstream and expensive.
 *
 * Each check here was run by hand during the 2026-07-31 full-stack review and passed. Encoding them
 * is what stops the next round from having to re-derive them — the point is not that they are
 * failing now, but that nothing would say so if they started.
 *
 * ## What is deliberately NOT here
 *
 * Judgement. This finds violations of rules with an exact mechanical form; it does not assess
 * design, naming or test quality, and a green run here is not a reviewed pull request. The
 * `claude-review` job in the same workflow is the half that reads. Keeping them separate means a
 * missing API key degrades the review rather than silently passing it.
 *
 * Advisory findings exit 0 on purpose. The dead-seam scan is a heuristic with known false positives
 * — during the review it flagged exactly one candidate, `objectSectionsOf`, which is used inside its
 * own file — and a gate that cries wolf is one people learn to ignore, which is the cost `§ D91`
 * records for wall-clock gates.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* -------------------------------------------------------------------------- *
 * Source loading
 * -------------------------------------------------------------------------- */

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const isTest = (path) => path.includes('.test.') || path.includes('.test-helper');

/**
 * Blank out comments and string literals, preserving line numbers.
 *
 * Both, not just comments: `random/rng.ts` names `Math.random` inside a docstring explaining why it
 * is forbidden, and an error message can quote the very construct a check forbids. A checker that
 * cannot tell code from prose reports the documentation as the violation, which is worse than not
 * checking — it teaches the reader that the gate is wrong.
 */
function stripNonCode(text) {
  let out = '';
  let index = 0;
  const keepNewlines = (chunk) => chunk.replace(/[^\n]/g, ' ');
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (two === '/*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += keepNewlines(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === '//') {
      const end = text.indexOf('\n', index);
      const stop = end === -1 ? text.length : end;
      out += keepNewlines(text.slice(index, stop));
      index = stop;
      continue;
    }
    const char = text[index];
    if (char === "'" || char === '"' || char === '`') {
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (text[cursor] === char) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      out += keepNewlines(text.slice(index, cursor));
      index = cursor;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Blank comments only, preserving string literals and line numbers. */
function stripComments(text) {
  let out = '';
  let index = 0;
  const keepNewlines = (chunk) => chunk.replace(/[^\n]/g, ' ');
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (two === '/*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += keepNewlines(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === '//') {
      const end = text.indexOf('\n', index);
      const stop = end === -1 ? text.length : end;
      out += keepNewlines(text.slice(index, stop));
      index = stop;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
}

const files = ['core', 'experiments', 'cli', 'viz']
  .flatMap((pkg) => walk(join(ROOT, 'packages', pkg, 'src')))
  .map((path) => ({
    path,
    rel: relative(ROOT, path),
    raw: readFileSync(path, 'utf8'),
  }))
  .map((file) => ({
    ...file,
    /* Comments AND strings blanked: for checks keyed on an identifier, where a string that
       mentions the construct is prose too. */
    code: stripNonCode(file.raw),
    /* Comments only: for checks that must READ a string literal — an import specifier, a profile
       id. Blanking strings here would make those checks silently unable to fire, which is the
       failure mode this file exists to prevent, so both forms are kept and each check names the
       one it needs. */
    codeOutsideComments: stripComments(file.raw),
  }));

const violations = [];
const advisories = [];

function scan(files_, pattern, describe, field = 'code') {
  for (const file of files_) {
    const lines = file[field].split('\n');
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        violations.push(`${file.rel}:${String(index + 1)} — ${describe}`);
      }
    });
  }
}

const production = files.filter((file) => !isTest(file.rel));
const core = production.filter((file) => file.rel.startsWith('packages/core/'));

/* -------------------------------------------------------------------------- *
 * Invariant 2 — no global RNG
 * -------------------------------------------------------------------------- */

/**
 * The two sites that may draw entropy, each because it is not a simulation draw.
 *
 * `cli/src/data.ts` mints a seed for a run the user did not pin, and always prints it — invariant 5
 * expressed in the UI, so the run still replays. `viz/src/dev/main.ts` seeds a viewer-only visual
 * detail. Both are outside `core/` and neither reaches a `StreamSet`.
 */
const RNG_ALLOWED = new Set(['packages/cli/src/data.ts', 'packages/viz/src/dev/main.ts']);

scan(
  production.filter((file) => !RNG_ALLOWED.has(file.rel)),
  /\bMath\s*\.\s*random\s*\(|\bcrypto\s*\.\s*getRandomValues\s*\(/,
  'invariant 2: every random draw comes from a named stream on the injected StreamSet',
);

/* -------------------------------------------------------------------------- *
 * Invariant 3 — no wall-clock in core/
 * -------------------------------------------------------------------------- */

scan(
  core,
  /\bDate\s*\.\s*now\s*\(|\bperformance\s*\.\s*now\s*\(|\bnew\s+Date\s*\(|\bsetTimeout\s*\(|\bsetInterval\s*\(/,
  'invariant 3: all time in core/ comes from the kernel',
);

/* -------------------------------------------------------------------------- *
 * Invariant 6 — core/ never depends on viz/
 * -------------------------------------------------------------------------- */

scan(
  core,
  /from\s+['"]@elevator-sim\/viz/,
  'invariant 6: core/ must build and test with viz absent',
  'codeOutsideComments',
);

/* -------------------------------------------------------------------------- *
 * Invariant 7 — strategy is data, not code
 * -------------------------------------------------------------------------- */

/**
 * Branching on a *profile id* is the failure invariant 7 names. Comparing a `mode`, a `kind` or a
 * building id is not — so this is deliberately anchored to the shipped dispatcher ids rather than to
 * equality against any string, which would flag most of the codebase and be ignored within a week.
 */
scan(
  production,
  /===\s*['"](nearest-car|collective|eta|destination-eta)['"]|['"](nearest-car|collective|eta|destination-eta)['"]\s*===/,
  'invariant 7: dispatch behaviour belongs in data/dispatcher-profiles.json, not in a branch on profile id',
  'codeOutsideComments',
);

/* -------------------------------------------------------------------------- *
 * Working-tree hygiene — file-sync duplicates
 * -------------------------------------------------------------------------- */

/**
 * `name 2.ts` copies from a file-sync client. They are gitignored, so `git status` stays clean while
 * `tsc`'s `include` still matches them and the tree-scanning tests read them: during the review they
 * produced **21** failures that had nothing to do with the code. Cheap to detect, expensive to
 * diagnose.
 */
const duplicates = ['packages', 'data', 'docs']
  .flatMap((dir) => walk(join(ROOT, dir)))
  .filter((path) => / \d+\.[^.]+$/.test(path))
  .map((path) => relative(ROOT, path));

for (const duplicate of duplicates) {
  violations.push(`${duplicate} — file-sync duplicate; remove with: git clean -fxd '* 2.*' '* 2'`);
}

/* -------------------------------------------------------------------------- *
 * Advisory — the dead integration seam
 * -------------------------------------------------------------------------- */

/**
 * This repository's signature defect: a behaviour that is configurable, unit-tested in isolation and
 * called from nothing shipped. It has landed **eleven** times.
 *
 * As of 2026-07-31 `core`'s own audit covers all fourteen of these directories with a proper
 * import-graph scanner, so this list is now a **backstop rather than the only coverage** — it exists
 * because a crude second opinion that runs on every PR is worth having beside a precise one that
 * runs in the suite, and because the two disagree in useful ways (this one sees a file the audit's
 * module partition does not).
 *
 * Advisory, not blocking, and it stays that way. A barrel re-export and a `{@link}` tag look exactly
 * like a caller and are not one, so the rule is *"name the non-test caller"* and that needs a human.
 */
const UNAUDITED = [
  'packages/core/src/analytical', 'packages/core/src/config', 'packages/core/src/dispatch/terms',
  'packages/core/src/kernel', 'packages/core/src/metrics', 'packages/core/src/model',
  'packages/core/src/model/car', 'packages/core/src/physics/doors', 'packages/core/src/physics/motion',
  'packages/core/src/random', 'packages/core/src/sim', 'packages/core/src/traffic',
];

const EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

for (const file of production) {
  const dir = file.rel.slice(0, file.rel.lastIndexOf('/'));
  if (!UNAUDITED.includes(dir)) continue;
  if (file.rel.endsWith('/index.ts')) continue;
  for (const match of file.raw.matchAll(EXPORT_RE)) {
    const name = match[1];
    const word = new RegExp(`\\b${name}\\b`);
    // Same-file use counts: an export used only by its own module is over-exported, not dead.
    if (word.test(file.code.replace(match[0], ''))) continue;
    let callers = 0;
    for (const other of files) {
      if (other.rel === file.rel) continue;
      if (isTest(other.rel) || other.rel.endsWith('/index.ts')) continue;
      if (word.test(other.code)) callers += 1;
    }
    if (callers === 0) advisories.push(`${file.rel} :: ${name} — no non-test, non-barrel caller found`);
  }
}

/* -------------------------------------------------------------------------- *
 * Report
 * -------------------------------------------------------------------------- */

console.log(`review-gates: scanned ${String(files.length)} source files`);

if (advisories.length > 0) {
  console.log(`\nadvisory — dead-seam candidates (${String(advisories.length)}), confirm by naming the caller:`);
  for (const advisory of advisories) console.log(`  ${advisory}`);
}

if (violations.length > 0) {
  console.log(`\nBLOCKING — ${String(violations.length)} invariant violation(s):`);
  for (const violation of violations) console.log(`  ${violation}`);
  console.log('\nEach is a rule in CLAUDE.md § Non-negotiable invariants. Fix, or raise the rule — never weaken it.');
  process.exit(1);
}

console.log('\nall blocking gates pass');

/*
 * A gate that asserts nothing passes. If the walk returns nothing — a moved directory, a changed
 * extension — every check above is vacuously green, which is the degradation this repository's own
 * audits guard against by asserting they found something to check.
 */
if (files.length < 100) {
  console.error(`\nreview-gates found only ${String(files.length)} files; the walk is broken, not the tree.`);
  process.exit(1);
}
