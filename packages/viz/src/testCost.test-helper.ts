/**
 * The deriver for this suite's test-cost figures — GitHub issue #344, [`DECISIONS.md`](../../../DECISIONS.md) § D492.
 *
 * ## What it exists to stop
 *
 * `vitest.config.ts` carried a paragraph naming two cases as *"already past this ceiling under
 * load"* when both carried an explicit annotation six and two-and-a-half times the ceiling it named.
 * It was retracted rather than edited, and the retraction is the third on that file. Every figure in
 * the argument — the annotation census, the slowest case, the amplification — was typed into prose
 * by somebody who had measured it once, and nothing re-derived any of them.
 * [`RISKS.md`](../../../RISKS.md) **R38** is that class, and `CLAUDE.md` records five separate
 * instances of it on one status row.
 *
 * So this file computes, from the tree and from a run, every quantity #344 asks about. The prose in
 * `vitest.config.ts` is asserted against it by `testCost.test.ts`, which is the half R38 asks for:
 * a figure with a deriver behind it cannot go stale without something going red.
 *
 * ## The two halves, and why only one of them can be always-on
 *
 * **The census is static.** It reads `packages/<pkg>/src/**.test.ts` and `vitest.config.ts` and needs
 * no clock, so it runs in the ordinary suite and costs milliseconds. Everything it says is a
 * property of the code.
 *
 * **The attribution is a measurement**, and a measurement of a machine as much as of the code. It
 * needs a `--reporter=json` run, which is the leg itself — a test cannot measure the suite it is
 * inside. So it is a deriver rather than a gate, on `honesty/measure.corpus.test.ts`'s precedent
 * (§ D343, R38's own remedy: *a ratchet or a derivation, never a pin*), and it writes to a file
 * because vitest 4 intercepts `console.log` and a figure printed to a swallowed stream reaches
 * nobody.
 *
 * ```
 * npx vitest run --project viz --reporter=json --outputFile=/tmp/viz.json
 * TEST_COST_REPORT=/tmp/viz.json TEST_COST_OUT=/tmp/cost.txt \
 *   npx vitest run --project viz packages/viz/src/testCost.test.ts
 * ```
 *
 * Two reports compare — `TEST_COST_REPORT_B` beside the first — which is how the machine-swing
 * claim below is measured rather than argued. `TEST_COST_REPORT` is optional: with only
 * `TEST_COST_OUT` set it writes the census alone, and with `TEST_COST_ROOT` pointed at an extracted
 * base commit it writes that tree's census, which is the only honest way to say whether a published
 * count has moved:
 *
 * ```
 * git archive <base> packages | tar -x -C /tmp/base
 * TEST_COST_ROOT=/tmp/base TEST_COST_OUT=/tmp/base-census.txt \
 *   npx vitest run --project viz packages/viz/src/testCost.test.ts
 * ```
 *
 * ## Which statistics survive a machine swing, and which do not
 *
 * § D483 measured the `experiments` leg at 35m25s and 19m27s **on identical work**, diagnosed the
 * machine, and #344's own comments then measured four more readings clustering at ~36 minutes: the
 * fast one was the outlier. A wall-clock budget stated as a constant is therefore wrong on this
 * evidence, and this module publishes no such constant.
 *
 * What it publishes instead, and what each can and cannot catch:
 *
 * | statistic | survives a uniform machine swing | catches |
 * |---|---|---|
 * | `share` of a file or case in `serialMs` | **yes**, exactly — both sides scale | one unit growing *relative to* the rest |
 * | `criticalPathShare` | **yes**, exactly | the leg's parallel floor moving |
 * | `concurrency` | **no** — it is a scheduling fact, reported and never gated | nothing; it is context |
 * | `cohortRatio` against pinned files | **yes** to first order | the suite growing in absolute work |
 * | any second count | **no** | nothing that is not really the machine |
 *
 * The first three are exact under the model *every duration multiplies by one factor*, which is
 * what § D483 measured (test CPU 1.8196×, wall 1.8205×, effective concurrency unmoved). They are
 * **blind to uniform growth by construction**: a suite where every file got 20 % slower has
 * identical shares. That blindness is asserted in `testCost.test.ts` rather than only claimed here,
 * because a declared limitation nobody mechanised is the stale refusal this repository keeps
 * finding (§ D227).
 *
 * `cohortRatio` is the answer to the blindness, and its own failure mode is named where it is
 * defined: it is a ratio against a **pinned** set of files, so it goes stale when they are renamed
 * and it reports its own coverage for exactly that reason.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourceFiles } from './deadCode.test-helper.js';

/** The repository root — this file sits at `packages/viz/src/`. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** `packages/`, the root of every project's tests. */
export const PACKAGES_DIR = join(REPO_ROOT, 'packages');

/** `vitest.config.ts`, which is where every ceiling in this file comes from. */
export const VITEST_CONFIG = join(REPO_ROOT, 'vitest.config.ts');

/**
 * Vitest's own default when a project sets no `testTimeout`.
 *
 * Transcribed rather than derived, because it lives in vitest and not in this repository.
 * `vitest.config.ts`'s docstring records it being confirmed empirically in four projects by running
 * an unannotated six-second case and reading `Test timed out in 5000ms`.
 */
export const VITEST_DEFAULT_TIMEOUT_MS = 5_000;

/** A repository-relative path with `/` separators, whatever the platform uses. */
export const repoRelative = (absolute: string): string =>
  relative(REPO_ROOT, absolute).split(sep).join('/');

/** What a project's tests may take before vitest fails them, and which files it runs. */
export interface ProjectCeiling {
  readonly project: string;
  readonly ceilingMs: number;
  /** True when the project's ceiling is vitest's default rather than a value the config sets. */
  readonly isDefault: boolean;
}

/**
 * The per-project ceilings, read out of `vitest.config.ts` rather than transcribed from it.
 *
 * Three shapes, and all three are in the file: `project('name', SIMULATING_TIMEOUT_MS)` takes the
 * constant, `project('name')` takes vitest's default, and the browser tier is an object literal
 * carrying its own `testTimeout`. A fourth shape arriving unparsed is not silent — `testCost.test.ts`
 * asserts the set of projects found here against `ciLegs.test.ts`'s own reading of the same file.
 */
export function ceilingsFrom(configSource: string): ReadonlyMap<string, ProjectCeiling> {
  const constants = new Map<string, number>();
  for (const match of configSource.matchAll(/\bconst ([A-Z_][A-Z0-9_]*) = ([0-9_]+);/gu)) {
    constants.set(match[1] as string, Number((match[2] as string).replaceAll('_', '')));
  }

  const out = new Map<string, ProjectCeiling>();
  for (const match of configSource.matchAll(/\bproject\('([a-z-]+)'(?:, ([A-Za-z_][A-Za-z0-9_]*))?\)/gu)) {
    const project = match[1] as string;
    const constant = match[2];
    const ceilingMs = constant === undefined ? undefined : constants.get(constant);
    out.set(project, {
      project,
      ceilingMs: ceilingMs ?? VITEST_DEFAULT_TIMEOUT_MS,
      isDefault: ceilingMs === undefined,
    });
  }

  // The object-literal projects: `name: 'x'` with a `testTimeout` after it in the same object.
  for (const match of configSource.matchAll(/name: '([a-z-]+)',[\s\S]{0,600}?testTimeout: ([0-9_]+)/gu)) {
    const project = match[1] as string;
    if (out.has(project)) continue;
    out.set(project, {
      project,
      ceilingMs: Number((match[2] as string).replaceAll('_', '')),
      isDefault: false,
    });
  }
  return out;
}

/**
 * Which project runs a test file, from its path.
 *
 * `packages/<pkg>/src/…` is the project `<pkg>`, except that a `*.browser.test.ts` belongs to
 * `<pkg>-browser` — `vitest.config.ts`'s `project()` helper excludes that suffix from every ordinary
 * project and the browser tier includes exactly it. **Returning `undefined` is a finding, not a
 * miss**: it means no registered project runs the file, which is `ciLegs.test.ts`'s subject wearing
 * a filename instead of a matrix entry.
 */
export function projectOf(
  repoRelativePath: string,
  ceilings: ReadonlyMap<string, ProjectCeiling>,
): string | undefined {
  const parts = repoRelativePath.split('/');
  if (parts[0] !== 'packages' || parts[2] !== 'src') return undefined;
  const pkg = parts[1] as string;
  const name = repoRelativePath.endsWith('.browser.test.ts') ? `${pkg}-browser` : pkg;
  return ceilings.has(name) ? name : undefined;
}

/** One `it`/`beforeAll` timeout argument, with everything needed to find and price it. */
export interface TimeoutAnnotation {
  readonly file: string;
  /** 1-based, the line carrying the closing argument. */
  readonly line: number;
  readonly opener: string;
  /** The first string literal inside the call, which is the case name when there is one. */
  readonly name: string | undefined;
  readonly ms: number;
  readonly via: 'literal' | 'constant';
  readonly project: string | undefined;
}

/**
 * A trailing argument that looks like an annotation and was not counted, with the reason.
 *
 * This is the census declaring its own blind spot instead of hiding it. Both reasons occur on
 * today's tree, and only one of them is a gap: `no opener` is `page.evaluate(fn, selector)` and
 * friends — a call that is not a test at all, correctly dropped — while `unresolved constant` would
 * be an annotation this scanner cannot price. There are none of the second kind today, and
 * `testCost.test.ts` asserts that, because the day there is one the census is wrong by an unknown
 * amount rather than by a stated one.
 */
export interface UnattributedTimeout {
  readonly file: string;
  readonly line: number;
  readonly argument: string;
  readonly reason: 'no opener' | 'unresolved constant';
}

const OPENER = /^(\s*)(it|test|describe|beforeAll|beforeEach|afterAll|afterEach)\b/u;
const CLOSER = /^(\s*)\}, ([A-Za-z0-9_.]+)\);\s*$/u;
const NUMERIC = /^[0-9_]+$/u;
const STRING_LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/u;

/**
 * Comments and string bodies blanked, **preserving every character position**.
 *
 * `deadCode.test-helper.ts#code` does the same job and is not reused here for one reason: it
 * *removes* rather than blanks, so line numbers shift, and every row this module publishes is a
 * `file:line` a reader has to be able to open. The stripping matters — a docstring quoting
 * `}, 600_000);` is exactly the shape being counted, and `vitest.config.ts`'s own retraction quotes
 * two of them.
 */
export function blankNonCode(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let index = from; index < to && index < out.length; index += 1) {
      if (out[index] !== '\n') out[index] = ' ';
    }
  };
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      let end = index;
      while (end < source.length && source[end] !== '\n') end += 1;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source[end] === char) {
          end += 1;
          break;
        }
        if (char !== '`' && source[end] === '\n') break; // unterminated: a line at a time
        end += 1;
      }
      blank(index + 1, Math.max(end - 1, index + 1));
      index = end;
      continue;
    }
    index += 1;
  }
  return out.join('');
}

/**
 * Every timeout annotation in one test file, and every candidate it declined to count.
 *
 * The recognised shape is the trailing argument of a vitest opener, closed on its own line —
 * `}, 600_000);` or `}, TIMEOUT_MS);`. That is the **only** shape `packages/<pkg>/src` uses, which is a
 * measurement rather than an assumption: `testCost.test.ts` fails if a numeric trailing argument
 * appears at a call it cannot attribute, and if a `{ timeout: n }` options object reaches an opener.
 * (The 103 `{ timeout: n }` occurrences in `packages/viz` today are all Playwright waits — a
 * `page.waitForSelector` option, not a vitest annotation — and counting them would inflate the
 * census by a fifth.)
 *
 * A constant is resolved only from a `const NAME = <number>;` **in the same file**, which is what
 * every site in the tree uses. An import from elsewhere would land in `unattributed`.
 */
export function annotationsIn(
  repoRelativePath: string,
  source: string,
  ceilings: ReadonlyMap<string, ProjectCeiling>,
): {
  readonly annotations: readonly TimeoutAnnotation[];
  readonly unattributed: readonly UnattributedTimeout[];
} {
  const blanked = blankNonCode(source);
  const lines = blanked.split('\n');
  const rawLines = source.split('\n');
  const project = projectOf(repoRelativePath, ceilings);

  const constants = new Map<string, number>();
  for (const match of blanked.matchAll(/\bconst ([A-Za-z_][A-Za-z0-9_]*) = ([0-9_]+);/gu)) {
    constants.set(match[1] as string, Number((match[2] as string).replaceAll('_', '')));
  }

  const annotations: TimeoutAnnotation[] = [];
  const unattributed: UnattributedTimeout[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const closing = CLOSER.exec(lines[index] as string);
    if (closing === null) continue;
    const indent = closing[1] as string;
    const argument = closing[2] as string;

    let opener: string | undefined;
    let openerLine = -1;
    for (let back = index - 1; back >= 0; back -= 1) {
      const found = OPENER.exec(lines[back] as string);
      if (found !== null && found[1] === indent) {
        opener = found[2] as string;
        openerLine = back;
        break;
      }
    }
    if (opener === undefined) {
      unattributed.push({ file: repoRelativePath, line: index + 1, argument, reason: 'no opener' });
      continue;
    }

    const literal = NUMERIC.test(argument);
    const ms = literal ? Number(argument.replaceAll('_', '')) : constants.get(argument);
    if (ms === undefined) {
      unattributed.push({
        file: repoRelativePath,
        line: index + 1,
        argument,
        reason: 'unresolved constant',
      });
      continue;
    }

    let name: string | undefined;
    for (let forward = openerLine; forward <= index; forward += 1) {
      const quoted = STRING_LITERAL.exec(rawLines[forward] as string);
      if (quoted !== null) {
        name = (quoted[1] ?? quoted[2] ?? '').replaceAll("\\'", "'");
        break;
      }
    }

    annotations.push({
      file: repoRelativePath,
      line: index + 1,
      opener,
      name,
      ms,
      via: literal ? 'literal' : 'constant',
      project,
    });
  }

  return { annotations, unattributed };
}

/** What one project's annotations look like against that project's own ceiling. */
export interface ProjectCensus {
  readonly project: string;
  readonly ceilingMs: number;
  readonly total: number;
  readonly above: number;
  readonly at: number;
  readonly below: number;
  readonly longestMs: number;
  /** Above-ceiling annotations only, so a reader can go to the sites. */
  readonly aboveSites: readonly TimeoutAnnotation[];
}

/** The whole tree's annotation population, by project. */
export interface Census {
  readonly annotations: readonly TimeoutAnnotation[];
  readonly unattributed: readonly UnattributedTimeout[];
  readonly byProject: ReadonlyMap<string, ProjectCensus>;
  readonly ceilings: ReadonlyMap<string, ProjectCeiling>;
  readonly filesScanned: number;
}

/**
 * The annotation census, derived from `packages/` and `vitest.config.ts`.
 *
 * **Every count is against the project's own ceiling**, which is the correction #344's own figures
 * need: *"above the 300 s project ceiling"* is the wrong frame for a file the `viz` project does not
 * run. Four of the ninety-three it counts are `*.browser.test.ts`, whose project sets 120 000 ms —
 * so they are above a ceiling, just not that one, and by 5× rather than 2×.
 */
export function censusOf(root: string = PACKAGES_DIR, configPath: string = VITEST_CONFIG): Census {
  const ceilings = ceilingsFrom(readFileSync(configPath, 'utf8'));
  const files = sourceFiles(root).filter((path) => path.endsWith('.test.ts'));

  /*
   * Paths are made relative to the **tree being scanned** rather than to this worktree, because
   * `root` is a `packages/` directory that may belong to another checkout — an extracted base
   * commit, which is the only way to answer whether a published count has moved. Relativising
   * against `REPO_ROOT` there produced `../../../tmp/…`, `projectOf` matched nothing, and the census
   * reported every project at zero: a wrong answer that looked like an empty tree.
   */
  const treeRoot = dirname(root);
  const annotations: TimeoutAnnotation[] = [];
  const unattributed: UnattributedTimeout[] = [];
  for (const absolute of files) {
    const path = relative(treeRoot, absolute).split(sep).join('/');
    const found = annotationsIn(path, readFileSync(absolute, 'utf8'), ceilings);
    annotations.push(...found.annotations);
    unattributed.push(...found.unattributed);
  }

  const byProject = new Map<string, ProjectCensus>();
  for (const [name, ceiling] of ceilings) {
    const mine = annotations.filter((a) => a.project === name);
    const above = mine.filter((a) => a.ms > ceiling.ceilingMs);
    byProject.set(name, {
      project: name,
      ceilingMs: ceiling.ceilingMs,
      total: mine.length,
      above: above.length,
      at: mine.filter((a) => a.ms === ceiling.ceilingMs).length,
      below: mine.filter((a) => a.ms < ceiling.ceilingMs).length,
      longestMs: mine.reduce((worst, a) => Math.max(worst, a.ms), 0),
      aboveSites: above,
    });
  }

  return { annotations, unattributed, byProject, ceilings, filesScanned: files.length };
}

/** One case as vitest's JSON reporter records it. */
export interface CaseCost {
  readonly file: string;
  readonly title: string;
  readonly fullName: string;
  readonly ms: number;
  readonly status: string;
}

/** One file's cost: its wall clock, what its cases account for, and what they do not. */
export interface FileCost {
  readonly file: string;
  readonly wallMs: number;
  readonly caseMs: number;
  /** `wallMs - caseMs`: collection, imports and hooks. Never negative by construction. */
  readonly outsideMs: number;
  readonly cases: readonly CaseCost[];
}

/** A run's cost, attributed, with every statistic #344 asks for. */
export interface Attribution {
  /** Heaviest first. */
  readonly files: readonly FileCost[];
  /** Heaviest first, across every file. */
  readonly cases: readonly CaseCost[];
  /** The sum of every file's wall clock: the leg's serial cost, before any concurrency. */
  readonly serialMs: number;
  /** The sum of every case's duration. */
  readonly caseMs: number;
  /** The observed wall clock of the run itself. */
  readonly runWallMs: number;
  /** `serialMs / runWallMs` — a scheduling fact about one machine. Reported, never gated. */
  readonly concurrency: number;
  /**
   * The heaviest file's share of `serialMs`.
   *
   * **The leg's floor.** Vitest schedules files, and cases inside one file run in series, so no
   * amount of concurrency takes the leg below its longest file. This share is what that floor costs
   * as a fraction of the whole, and it is invariant under a uniform machine swing.
   */
  readonly criticalPathShare: number;
  readonly sharesByFile: ReadonlyMap<string, number>;
}

interface RawCase {
  readonly title?: unknown;
  readonly fullName?: unknown;
  readonly duration?: unknown;
  readonly status?: unknown;
}
interface RawFile {
  readonly name?: unknown;
  readonly startTime?: unknown;
  readonly endTime?: unknown;
  readonly assertionResults?: unknown;
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * A vitest `--reporter=json` report, attributed.
 *
 * The shape is validated loosely and on purpose: a reporter that changes a field name should make
 * this throw with the field named, rather than quietly attribute a suite of zeroes. A run whose
 * files carry no timing at all is refused outright.
 */
export function attributionOf(report: unknown): Attribution {
  if (typeof report !== 'object' || report === null) {
    throw new Error('test-cost: the report is not an object — is this a vitest JSON report?');
  }
  const results = (report as { testResults?: unknown }).testResults;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('test-cost: the report carries no `testResults` — nothing to attribute.');
  }
  const startTime = numberOr((report as { startTime?: unknown }).startTime, Number.NaN);

  const files: FileCost[] = [];
  let latestEnd = Number.NEGATIVE_INFINITY;
  for (const raw of results as readonly RawFile[]) {
    const name = typeof raw.name === 'string' ? raw.name : undefined;
    if (name === undefined) throw new Error('test-cost: a file result carries no `name`.');
    const file = repoRelative(name);
    const start = numberOr(raw.startTime, Number.NaN);
    const end = numberOr(raw.endTime, Number.NaN);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new Error(`test-cost: ${file} carries no start/end time — the report has no clock in it.`);
    }
    latestEnd = Math.max(latestEnd, end);
    const cases: CaseCost[] = [];
    for (const entry of (Array.isArray(raw.assertionResults) ? raw.assertionResults : []) as readonly RawCase[]) {
      cases.push({
        file,
        title: typeof entry.title === 'string' ? entry.title : '',
        fullName: typeof entry.fullName === 'string' ? entry.fullName : '',
        ms: numberOr(entry.duration, 0),
        status: typeof entry.status === 'string' ? entry.status : 'unknown',
      });
    }
    const wallMs = Math.max(end - start, 0);
    const caseMs = cases.reduce((sum, one) => sum + one.ms, 0);
    files.push({ file, wallMs, caseMs, outsideMs: Math.max(wallMs - caseMs, 0), cases });
  }

  files.sort((a, b) => b.wallMs - a.wallMs);
  const serialMs = files.reduce((sum, one) => sum + one.wallMs, 0);
  const caseMs = files.reduce((sum, one) => sum + one.caseMs, 0);
  const runWallMs = Number.isNaN(startTime) ? serialMs : Math.max(latestEnd - startTime, 1);
  const cases = files.flatMap((one) => one.cases).sort((a, b) => b.ms - a.ms);
  const heaviest = files[0];

  return {
    files,
    cases,
    serialMs,
    caseMs,
    runWallMs,
    concurrency: serialMs / runWallMs,
    criticalPathShare: heaviest === undefined || serialMs === 0 ? 0 : heaviest.wallMs / serialMs,
    sharesByFile: new Map(files.map((one) => [one.file, serialMs === 0 ? 0 : one.wallMs / serialMs])),
  };
}

/** How few files hold `share` of the leg's serial cost — 0.5 for half of it. */
export function filesCovering(attribution: Attribution, share: number): number {
  let accumulated = 0;
  for (const [index, file] of attribution.files.entries()) {
    accumulated += file.wallMs;
    if (accumulated >= attribution.serialMs * share) return index + 1;
  }
  return attribution.files.length;
}

/** What moved between two runs, in the units that survive a machine swing. */
export interface Drift {
  /** `b.serialMs / a.serialMs` — the machine factor, reported so it can be seen rather than gated. */
  readonly scale: number;
  readonly worstShareMove: { readonly file: string; readonly delta: number } | undefined;
  /** Σ|Δshare| over files in both runs: 0 under a pure machine swing, 2 if nothing survives. */
  readonly totalAbsShareDelta: number;
  readonly criticalPathShareDelta: number;
  /** Files whose rank in the top ten moved, and by how far. */
  readonly rankMoves: readonly { readonly file: string; readonly from: number; readonly to: number }[];
  readonly onlyInA: readonly string[];
  readonly onlyInB: readonly string[];
}

/**
 * Two runs compared in shares and ranks rather than in seconds — #344's third criterion.
 *
 * Under the model § D483 measured (*every duration multiplies by one factor*) every field except
 * `scale` is exactly zero. So a reading of `scale = 1.8` with `totalAbsShareDelta ≈ 0` says
 * **the machine moved and the suite did not**, which is the reading a wall-clock budget cannot make
 * and is the whole of why this returns what it returns.
 */
export function driftBetween(a: Attribution, b: Attribution): Drift {
  const shared = [...a.sharesByFile.keys()].filter((file) => b.sharesByFile.has(file));
  let worst: { file: string; delta: number } | undefined;
  let total = 0;
  for (const file of shared) {
    const delta = (b.sharesByFile.get(file) ?? 0) - (a.sharesByFile.get(file) ?? 0);
    total += Math.abs(delta);
    if (worst === undefined || Math.abs(delta) > Math.abs(worst.delta)) worst = { file, delta };
  }
  const rankIn = (attribution: Attribution): ReadonlyMap<string, number> =>
    new Map(attribution.files.map((file, index) => [file.file, index + 1]));
  const ranksA = rankIn(a);
  const ranksB = rankIn(b);
  const rankMoves = [...ranksA.entries()]
    .filter(([file, rank]) => (rank <= 10 || (ranksB.get(file) ?? 99) <= 10) && ranksB.has(file))
    .map(([file, rank]) => ({ file, from: rank, to: ranksB.get(file) ?? 0 }))
    .filter((move) => move.from !== move.to);

  return {
    scale: a.serialMs === 0 ? 0 : b.serialMs / a.serialMs,
    worstShareMove: worst,
    totalAbsShareDelta: total,
    criticalPathShareDelta: b.criticalPathShare - a.criticalPathShare,
    rankMoves,
    onlyInA: [...a.sharesByFile.keys()].filter((file) => !b.sharesByFile.has(file)),
    onlyInB: [...b.sharesByFile.keys()].filter((file) => !a.sharesByFile.has(file)),
  };
}

/** The suite's cost measured in units of a pinned set of files, rather than in seconds. */
export interface CohortRatio {
  readonly present: number;
  readonly pinned: number;
  readonly cohortMs: number;
  /** `serialMs / cohortMs` — dimensionless, and the only statistic here that sees absolute growth. */
  readonly ratio: number;
}

/**
 * The leg's cost in units of a same-run baseline — the instrument #344's comment asks for.
 *
 * Shares are blind to a suite that grew uniformly. This is not: the numerator is the whole leg and
 * the denominator is a fixed set of files, so a new sweep in one file raises the ratio while a
 * machine 1.8× slower leaves it alone — both sides scale together.
 *
 * **Its failure mode is staleness, and it is reported rather than hidden.** The cohort is pinned by
 * *name*; a renamed or deleted member silently shrinks the denominator and inflates the ratio, so
 * `present` against `pinned` is returned beside it and a reader who sees them diverge should re-pin
 * rather than believe the number.
 */
export function cohortRatio(attribution: Attribution, cohort: readonly string[]): CohortRatio {
  const wanted = new Set(cohort);
  const members = attribution.files.filter((file) => wanted.has(file.file));
  const cohortMs = members.reduce((sum, file) => sum + file.wallMs, 0);
  return {
    present: members.length,
    pinned: cohort.length,
    cohortMs,
    ratio: cohortMs === 0 ? 0 : attribution.serialMs / cohortMs,
  };
}

/** Why an above-ceiling annotation costs what it costs — or why nothing can be said about it. */
export type AnnotationVerdict =
  | { readonly kind: 'case'; readonly measuredMs: number; readonly headroom: number }
  | { readonly kind: 'hook'; readonly fileOutsideMs: number }
  | { readonly kind: 'file did not run' }
  | { readonly kind: 'name not matched' };

/** One annotation, priced against the run that was measured. */
export interface AnnotationCost {
  readonly annotation: TimeoutAnnotation;
  readonly verdict: AnnotationVerdict;
}

/**
 * Annotations joined to what they actually cost — the evidence #344's second criterion needs.
 *
 * The join is by case **title** within the file, which is exact for an ordinary `it` and impossible
 * for an `it.each` whose title carries a `%s`. Both non-joins are returned as verdicts rather than
 * dropped, because a census that quietly loses the rows it cannot price is the defect this module
 * exists to stop.
 *
 * A `beforeAll` has no row in the report at all, so what is returned for it is the file's
 * `outsideMs` — an upper bound on every hook in that file together, which is the honest thing a
 * per-case reporter can say about one.
 */
export function annotationCosts(
  annotations: readonly TimeoutAnnotation[],
  attribution: Attribution,
): readonly AnnotationCost[] {
  const byFile = new Map(attribution.files.map((file) => [file.file, file]));
  return annotations.map((annotation) => {
    const file = byFile.get(annotation.file);
    if (file === undefined) return { annotation, verdict: { kind: 'file did not run' } };
    if (annotation.opener !== 'it' && annotation.opener !== 'test') {
      return { annotation, verdict: { kind: 'hook', fileOutsideMs: file.outsideMs } };
    }
    const measured = file.cases.find((one) => one.title === annotation.name);
    if (measured === undefined) return { annotation, verdict: { kind: 'name not matched' } };
    return {
      annotation,
      verdict: {
        kind: 'case',
        measuredMs: measured.ms,
        headroom: measured.ms === 0 ? Number.POSITIVE_INFINITY : annotation.ms / measured.ms,
      },
    };
  });
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const percent = (share: number): string => `${(share * 100).toFixed(2)} %`;

/** The census as text, for a file a reporter cannot swallow. */
export function formatCensus(census: Census): string {
  const lines = [
    `files scanned: ${census.filesScanned}`,
    `annotations: ${census.annotations.length}`,
    `unattributed: ${census.unattributed.length} (${census.unattributed.filter((one) => one.reason === 'unresolved constant').length} unresolved constants)`,
    '',
    'project        ceiling     total   above      at   below   longest',
  ];
  for (const one of [...census.byProject.values()].sort((a, b) => b.above - a.above)) {
    lines.push(
      `${one.project.padEnd(14)} ${String(one.ceilingMs).padStart(8)} ${String(one.total).padStart(8)} ${String(one.above).padStart(7)} ${String(one.at).padStart(7)} ${String(one.below).padStart(7)} ${String(one.longestMs).padStart(9)}`,
    );
  }
  return lines.join('\n');
}

/** The attribution as text, top-heavy first, with the shares that survive a machine swing. */
export function formatAttribution(attribution: Attribution, topN = 20): string {
  const lines = [
    `run wall: ${seconds(attribution.runWallMs)}   serial (Σ file wall): ${seconds(attribution.serialMs)}   concurrency: ${attribution.concurrency.toFixed(2)}`,
    `case time: ${seconds(attribution.caseMs)} = ${percent(attribution.caseMs / attribution.serialMs)} of serial`,
    `files: ${attribution.files.length}   cases: ${attribution.cases.length}`,
    `critical path: ${attribution.files[0]?.file ?? '—'} at ${percent(attribution.criticalPathShare)} of serial`,
    `files covering 50/80/90/95 %: ${[0.5, 0.8, 0.9, 0.95].map((share) => filesCovering(attribution, share)).join(' / ')}`,
    '',
    `top ${topN} files`,
  ];
  for (const file of attribution.files.slice(0, topN)) {
    lines.push(
      `${seconds(file.wallMs).padStart(9)} ${percent(file.wallMs / attribution.serialMs).padStart(8)}  cases=${String(file.cases.length).padStart(4)}  outside=${seconds(file.outsideMs).padStart(8)}  ${file.file}`,
    );
  }
  lines.push('', `top ${topN} cases`);
  for (const one of attribution.cases.slice(0, topN)) {
    lines.push(
      `${seconds(one.ms).padStart(9)} ${percent(one.ms / attribution.serialMs).padStart(8)}  ${one.file}  ${one.title.slice(0, 60)}`,
    );
  }
  return lines.join('\n');
}
