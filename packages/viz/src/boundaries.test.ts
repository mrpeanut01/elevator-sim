/**
 * The boundaries this package promises to keep, checked mechanically.
 *
 * Every one of these is a rule that a reviewer could only otherwise enforce by reading, and
 * this repository's own history says reading is not enough: agents have reported green suites
 * that were red and fixes that were not applied. So the rules are greps, and they run in CI.
 *
 * 1. **`core` does not know this package exists** — CLAUDE.md invariant 6. Checked here as a
 *    grep over `packages/core/src` and `packages/experiments/src`. (The *strong* form —
 *    physically removing `packages/viz` and rebuilding — is a manual gate recorded in the
 *    delivery report; this is the regression that catches a reverse import being added later.)
 * 2. **Wall-clock time enters through `DisplayClock` and nowhere else.** The renderer is
 *    allowed a clock; that is what distinguishes it from `core`. But if `Date.now()` could
 *    appear anywhere, the replay criterion would be one careless edit away from being
 *    untestable, so the clock has exactly one home.
 * 3. **The DOM is confined to `src/dev/`.** Everything that produces or draws a frame runs
 *    under Node, which is why the whole package is testable without a browser.
 * 4. **No `node:` import outside the dev entry point and the test helpers.** The contract, the
 *    frame producer, playback and the renderer must all be loadable in a browser bundle.
 * 5. **A workspace package with a `browser` export condition is reached through its `./browser`
 *    subpath, never by its bare name.** TypeScript's `NodeNext` resolution does not apply the
 *    `browser` condition, so a bare specifier typechecks against the *Node* surface while the
 *    bundler hands the browser one — the types and the bundle disagree, and the disagreement is
 *    silent until something calls a name that is not there. `core` has had this rule since its
 *    split; `experiments` gained the condition in DECISIONS.md § D121, which recorded *"nothing
 *    mechanically forces a `viz` file to pick it"* as the open item. This file is that mechanism.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const VIZ_SRC = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Comments removed, so a rule is about *code* rather than about prose.
 *
 * This matters more than it sounds. Half the value of these files is their docstrings, and a
 * docstring that explains why `requestAnimationFrame` lives in the dev entry point must not
 * trip the rule that keeps it there. Naming the thing you are avoiding is how the avoidance
 * stays understood.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/**
 * String *contents* removed, so a rule is about code rather than about prose — including the
 * prose a program prints.
 *
 * The same argument as {@link stripComments}, extended to the place the argument actually bites.
 * Wave 2's viewer says `the document is not a JSON object` when a load fails and draws
 * `showing 6 of 12 shafts — widen the window`, and under a raw grep for `\bdocument\b` and
 * `\bwindow\b` both of those are DOM access in a module that has none. Loosening the pattern
 * instead — matching only `document.` and `window.` — would have been the cheaper fix and a
 * worse one: it stops catching a bare `document` passed as a value, which is exactly the shape
 * of the one real finding this rule produced (a method parameter named `document`, shadowing the
 * global, in `editorHistory.ts`).
 *
 * Template literals keep their `${…}` substitutions, because those are code.
 *
 * A character scanner rather than a set of regular expressions, and that is not fastidiousness:
 * the regex version of this function was written first, and its middle-of-template pattern —
 * `/\}…`/` — anchored on *any* closing brace in the file and then ate everything up to the next
 * backtick, which silenced the whole of `dev/main.ts`. The positive control below is what caught
 * it, before the loosened rule could pass a file that really did touch the DOM.
 */
function stripStringLiterals(text: string): string {
  let out = '';
  let index = 0;
  /** Depth of `${ … }` nesting inside template literals, innermost last. */
  const templateDepths: number[] = [];
  let braceDepth = 0;

  while (index < text.length) {
    const char = text[index] ?? '';

    if (char === '\\') {
      out += '  ';
      index += 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      out += quote;
      index += 1;
      while (index < text.length && text[index] !== quote && text[index] !== '\n') {
        index += text[index] === '\\' ? 2 : 1;
      }
      out += quote;
      index += 1;
      continue;
    }

    if (char === '`') {
      out += '`';
      index += 1;
      // Consume template text, stopping at `${` (code resumes) or the closing backtick.
      while (index < text.length) {
        if (text[index] === '\\') {
          index += 2;
          continue;
        }
        if (text[index] === '`') {
          out += '`';
          index += 1;
          break;
        }
        if (text[index] === '$' && text[index + 1] === '{') {
          out += '${';
          index += 2;
          templateDepths.push(braceDepth);
          braceDepth += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '{') braceDepth += 1;
    if (char === '}') {
      braceDepth -= 1;
      const resume = templateDepths[templateDepths.length - 1];
      if (resume !== undefined && braceDepth === resume) {
        // Back into template text: emit the brace, then keep consuming literal characters.
        templateDepths.pop();
        out += '}';
        index += 1;
        while (index < text.length) {
          if (text[index] === '\\') {
            index += 2;
            continue;
          }
          if (text[index] === '`') {
            out += '`';
            index += 1;
            break;
          }
          if (text[index] === '$' && text[index + 1] === '{') {
            out += '${';
            index += 2;
            templateDepths.push(braceDepth);
            braceDepth += 1;
            break;
          }
          index += 1;
        }
        continue;
      }
    }

    out += char;
    index += 1;
  }
  return out;
}

interface SourceFile {
  /** Path relative to `packages/viz/src`, with forward slashes. */
  readonly id: string;
  /** Source with comments removed. */
  readonly code: string;
  /** Source with comments *and* string contents removed. */
  readonly identifiers: string;
}

async function vizSources(): Promise<readonly SourceFile[]> {
  const files = await walk(VIZ_SRC);
  return Promise.all(
    files.map(async (path) => {
      const code = stripComments(await readFile(path, 'utf8'));
      return {
        id: relative(VIZ_SRC, path).split('\\').join('/'),
        code,
        identifiers: stripStringLiterals(code),
      };
    }),
  );
}

/** The DOM globals a browser-free module must not name. */
const DOM_PATTERN = /\b(?:document|window|requestAnimationFrame|HTMLCanvasElement)\b/;

/**
 * Member names removed, so the rule is about **globals** rather than about spelling.
 *
 * The third narrowing this file has needed, and the same argument as {@link stripComments} and
 * {@link stripStringLiterals}: a rule about code must not fire on something that is provably not
 * code of the kind it forbids. `foo.window` is a property of `foo`. It cannot be the DOM's
 * `window` under any binding, because the global is reached by a *bare* reference — so matching it
 * is a false positive by construction, not a judgement call about how likely a collision is.
 *
 * It bit on a real field. `core`'s `RunSummary.window` is the {@link ReportWindow} every cohort
 * statistic is computed over, and `docs/10-experience-layer-contract.md` § 7.4 makes carrying it
 * into the recording a prerequisite for the whole of U5 — *"riders waited 25 seconds on average"*
 * is false without *"during the busiest 5 minutes"*. `record/recordRun.ts` has to read
 * `summary.window` to copy it, and no rename in this package can change what `core` calls its own
 * field.
 *
 * **What is deliberately still caught**, and why the narrowing does not hollow the rule out:
 *
 * - `document.getElementById(…)` — the receiver is a bare reference, not a member.
 * - `const x = document;` and `foo(document)` — the finding this rule actually produced was a
 *   parameter named `document` shadowing the global, passed as a value. Bare, so still caught.
 * - `window.matchMedia(…)`, `requestAnimationFrame(…)` — bare.
 *
 * Only `x.window`, `x.document` and friends are exempted, and the positive control below is what
 * proves the narrowing did not silence the two files that genuinely touch the DOM.
 */
function stripMemberNames(text: string): string {
  return text.replace(/\.\s*[A-Za-z_$][\w$]*/g, '.');
}

/** Files whose job is to touch the outside world. */
const isTest = (id: string): boolean => id.endsWith('.test.ts') || id.endsWith('.test-helper.ts');

/**
 * The Everyday shell's two DOM-owning files — the second shell, exempted by name.
 *
 * `everyday/` is an entry point in the same sense `dev/` is: `boot.ts` is what `index.html` loads,
 * and `shell.ts` builds the rail, the screen region and the action bar. What is *not* exempt is the
 * rest of the directory — `types.ts`, `modes.ts` and `rail.ts` are pure decisions about what the
 * shell shows, kept free of the document precisely so they can be tested in this node tier, and the
 * rules below are what hold them there.
 *
 * So the exemption is **two file names rather than a `startsWith('everyday/')`**. A prefix would
 * have exempted a directory that is mostly pure, and the day one of those three reached for a
 * `document` this suite would have said nothing.
 */
const EVERYDAY_SHELL_FILES = new Set(['everyday/boot.ts', 'everyday/shell.ts']);

/** A shell entry point: `dev/` wholesale, and the Everyday shell's two DOM-owning files. */
const isDev = (id: string): boolean => id.startsWith('dev/') || EVERYDAY_SHELL_FILES.has(id);

describe('CLAUDE.md invariant 6 — core never depends on viz', () => {
  it('has no reference to viz anywhere in core or experiments sources', async () => {
    const offenders: string[] = [];
    for (const pkg of ['core', 'experiments']) {
      const dir = join(REPO_ROOT, 'packages', pkg, 'src');
      for (const path of await walk(dir)) {
        const text = stripComments(await readFile(path, 'utf8'));
        for (const [index, line] of text.split('\n').entries()) {
          /* Import specifiers and package names only, over comment-stripped source: a prose
             mention of Phase 4's web viewer in a docstring is not a dependency, and banning
             the word would be theatre. */
          if (/@elevator-sim\/viz|from\s+['"][^'"]*\bviz\b|packages\/viz/.test(line)) {
            offenders.push(`${relative(REPO_ROOT, path)}:${String(index + 1)}: ${line.trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the wall clock has exactly one home', () => {
  it('is read only in playback/clock.ts', async () => {
    const offenders = (await vizSources())
      .filter((file) => file.id !== 'playback/clock.ts' && !isTest(file.id))
      .filter((file) => /\b(?:Date\.now|performance\.now)\s*\(/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('schedules no timers anywhere, so tests never wait', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => /\b(?:setTimeout|setInterval)\s*\(/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });
});

describe('the DOM is confined to the dev entry point', () => {
  it('is not touched by the contract, the frame producer, playback, the renderer or the editor', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => DOM_PATTERN.test(stripMemberNames(file.identifiers)))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('negative control: a bare global is caught, and a property of that name is not', () => {
    // The narrowing, stated as a test rather than as a comment. The first four are the shapes
    // `dev/main.ts` uses; the last two are the shapes `record/recordRun.ts` and
    // `contract/types.ts` need in order to carry `RunSummary.window` into the recording.
    for (const caught of [
      'document.getElementById(id)',
      'const node = document;',
      'window.matchMedia(query)',
      'requestAnimationFrame(tick)',
    ]) {
      expect(DOM_PATTERN.test(stripMemberNames(caught)), caught).toBe(true);
    }
    for (const allowed of ['summary.window.startS', 'result.summary.window', 'a.document.b']) {
      expect(DOM_PATTERN.test(stripMemberNames(allowed)), allowed).toBe(false);
    }
  });

  it('positive control: the rule still catches the entry point that does touch the DOM', async () => {
    // Without this, stripping strings could quietly turn the rule above into a rule that passes
    // because it matches nothing. `dev/main.ts` and `dev/editor.ts` are the two files in the
    // package that genuinely use the DOM, and both must still trip the pattern after stripping.
    const sources = await vizSources();
    for (const id of ['dev/main.ts', 'dev/editor.ts']) {
      const file = sources.find((candidate) => candidate.id === id);
      expect(file, `${id} is missing`).toBeDefined();
      // Through the *same* narrowing the rule above applies. Testing the un-narrowed form here
      // would leave the positive control passing for a reason the real rule no longer uses.
      expect(
        DOM_PATTERN.test(stripMemberNames(file?.identifiers ?? '')),
        `${id} should trip the DOM rule`,
      ).toBe(true);
    }
  });

  it('positive control: a bare `document` identifier is caught, not only `document.`', async () => {
    // The finding this rule actually produced was a method parameter named `document`, which is
    // never followed by a dot. A pattern that only matched member access would have missed it.
    expect(DOM_PATTERN.test(stripStringLiterals('function f(document) { return document; }'))).toBe(
      true,
    );
    expect(DOM_PATTERN.test(stripStringLiterals("const message = 'the document is empty';"))).toBe(
      false,
    );
    expect(DOM_PATTERN.test(stripStringLiterals('const t = `widen the window`;'))).toBe(false);
    // …and a substitution inside a template literal is still code.
    expect(DOM_PATTERN.test(stripStringLiterals('const t = `w ${window.innerWidth} px`;'))).toBe(
      true,
    );
  });
});

/**
 * Where a world figure can enter the product — GAMEPLAY § 16 rule 15, GitHub issue #123.
 *
 * > **Every screen renders with the API absent.** World figures … degrade to a labelled *world
 * > figures unavailable* state. Never a zero, never a spinner, never an empty chart that reads as
 * > "nobody played".
 *
 * ## Why this is a boundary rather than a rendering test
 *
 * A rendering test can only ask *does this surface degrade well* of a surface somebody thought to
 * ask about. The claim § 16 rule 15 makes is about **every** screen, and the cheapest true form of
 * it is structural: a surface that never reads the server has nothing to lose when it is absent,
 * so the question is only ever about the modules that do. Confining those to a named list turns
 * *"which screens need the world?"* from a judgement into a grep — and it is what lets the Everyday
 * surfaces this delivery built (`watch/`, `fixit/`, `live/raceStrip.ts`, `batch/suite.ts`, the rules
 * editor) be **complete with no server** by construction rather than by inspection.
 *
 * The two that remain are the leaderboard and the challenge, and both are driven with the API absent
 * by the honesty sweep's `world-absent` axis (`honesty/generate.ts#WITHHELD_REASONS`), which is the
 * other half of this rule: this one says where a hole can be, that one says the hole is labelled.
 *
 * **Type-only imports are not consumers.** `menu/screens.ts` takes a `BoardPage` it is *given*;
 * `menu/boardRun.ts` reads a `RunSubmission` off a row it is handed. Neither can fetch anything, and
 * a rule that counted them would be about spelling rather than about reach.
 *
 * **Two files, and the second is this instrument.** The list came out shorter than it was written:
 * `dev/menuPanel.ts` draws every board in the product and imports the client **for its types only**,
 * so even the panel cannot ask the server anything — it is handed a page, and when it is handed none
 * it draws the labelled example (issue #28) rather than an empty table. That is § 16 rule 15 already
 * satisfied structurally on the one screen most likely to break it.
 */
const SERVER_READERS: readonly string[] = Object.freeze([
  // The shell, which owns the transport and hands every answer to a panel as data.
  'dev/main.ts',
  // The sweep, which drives the client's own three sentences and both arms of the board screen.
  'honesty/surfaces.ts',
]);

describe('§ 16 rule 15 — a missing server can only leave a hole where the world was', () => {
  it('confines the leaderboard client to the shell, the board panel and the sweep', async () => {
    const readers = (await vizSources())
      .filter((file) => !isTest(file.id))
      // A value import: `import type { … } from './client.js'` cannot reach the network.
      .filter((file) => /import\s+(?!type\b)[^;]*from\s+['"][^'"]*menu\/client\.js['"]/.test(file.code))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      readers,
      'a module gained a leaderboard client. Either it is a screen that must degrade with the API ' +
        'absent — in which case drive it under the sweep’s `world-absent` axis and add it here — or ' +
        'it should be handed the answer as data, which is how every other surface reads the world.',
    ).toEqual([...SERVER_READERS]);
  });

  it('leaves the Everyday surfaces with no world figure to lose', async () => {
    /*
     * The claim stated positively, over the directories the Everyday delivery built. It is not
     * implied by the list above — a future entry in `SERVER_READERS` could name one of these, and
     * the rule that matters for § 16 rule 15 is that a spectator's replay, a fix-a-building case, a
     * race strip and a bench suite are **local**: every figure they print comes from a run this
     * machine made, so the API being absent removes nothing from them.
     */
    const everyday = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter(
        (file) =>
          file.id.startsWith('watch/') ||
          file.id.startsWith('fixit/') ||
          file.id === 'live/raceStrip.ts' ||
          file.id === 'batch/suite.ts' ||
          file.id === 'dev/ruleEditor.ts' ||
          file.id === 'authoring/ruleSpec.ts',
      );
    // The set is real — a path typo would make the assertion below vacuous, which is this file's
    // own positive-control habit.
    expect(everyday.length).toBeGreaterThan(8);
    expect(everyday.filter((file) => /menu\/client\.js/.test(file.code)).map((file) => file.id)).toEqual([]);
  });
});

describe('the browser-facing modules import no node builtins', () => {
  it('leaves `node:` to the dev entry point and the test helpers', async () => {
    const offenders = (await vizSources())
      .filter((file) => !isDev(file.id) && !isTest(file.id))
      .filter((file) => /from\s+['"]node:/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('reaches core through the browser subpath, so the types match the bundle', async () => {
    // `core`'s default entry re-exports `loadConfig`, which imports `node:fs/promises`. The
    // package's `browser` export condition already routes a bundler to the fs-free barrel, so a
    // bare specifier produces a correct *bundle* — but TypeScript's NodeNext resolution does not
    // apply that condition, so a browser file importing the bare specifier still SEES `loadConfig`
    // in its types. Calling it would typecheck and fail at runtime. The explicit subpath closes
    // that gap. Test helpers and the dev entry's data loader legitimately run under Node.
    const offenders = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) => /from\s+['"]@elevator-sim\/core['"]/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('positive control: the rule catches a bare-specifier import', () => {
    const bare = "import type { SimTime } from '@elevator-sim/core';";
    const subpath = "import type { SimTime } from '@elevator-sim/core/browser';";
    expect(/from\s+['"]@elevator-sim\/core['"]/.test(bare)).toBe(true);
    expect(/from\s+['"]@elevator-sim\/core['"]/.test(subpath)).toBe(false);
  });

  it('does not reach into `cli` at all', async () => {
    // `viz` depends on `core` and on `experiments`' browser barrel, and on nothing else in the
    // repository. `cli` is an executable: importing it from a renderer would drag `node:fs`,
    // `node:process` and an argument parser into the browser bundle.
    const offenders = (await vizSources())
      .filter((file) => /@elevator-sim\/cli/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('reaches experiments only through the browser subpath — never the bare specifier', async () => {
    // **The rule that closes DECISIONS.md § D121's stated open item**, and it is the same rule two
    // tests above, pointed at the second package that grew a `browser` export condition.
    //
    // § D121: *"TypeScript does not apply the `browser` export condition, so a browser-only file
    // importing `@elevator-sim/experiments` typechecks against the **Node** types. The mitigation
    // is the explicit `./browser` subpath, and nothing mechanically forces a `viz` file to pick
    // it. In `core` that gap was one function; here it is hundreds of names."* This is the thing
    // that forces it.
    //
    // Two differences from the `core` rule above, both deliberate:
    //
    // 1. **Tests are not exempt.** `core`'s rule exempts them because `viz`'s tests and its dev
    //    data loader legitimately call `loadConfig`, which is exactly what the Node barrel is
    //    for. Nothing in this package has a legitimate use for `experiments`' Node surface — the
    //    runner's worker pool, NDJSON persistence and the acceptance harness are not viewer
    //    concerns — so a bare import is an offence in every file, and a test that reached for one
    //    would be the first place the gap re-opened.
    // 2. **The offence is the specifier, not the package.** `@elevator-sim/experiments/browser`
    //    is required and correct; `@elevator-sim/experiments` is not. A rule that banned the
    //    package outright (which is what this test said before W4) cannot express that.
    const offenders = (await vizSources())
      .filter((file) => /from\s+['"]@elevator-sim\/experiments['"]/.test(file.code))
      .map((file) => file.id);
    expect(offenders).toEqual([]);
  });

  it('positive control: the experiments rule catches a bare specifier and passes the subpath', () => {
    // Without this, the rule above could pass because its pattern matched nothing — the silent
    // mode § D121 watched a resolver degrade into.
    //
    // The two specifiers are **assembled** rather than written out, and that is not style: the
    // rule above reads comment-stripped source and does *not* strip string contents, and it does
    // not exempt tests, so spelling either specifier as a literal here would make this file its
    // own first offender. Watched happening, on the first run of this rule.
    const bare = `import { collectSearchSpace } from '@elevator-sim/${'experiments'}';`;
    const subpath = `import { collectSearchSpace } from '@elevator-sim/${'experiments'}/browser';`;
    const pattern = /from\s+['"]@elevator-sim\/experiments['"]/;
    expect(pattern.test(bare)).toBe(true);
    expect(pattern.test(subpath)).toBe(false);
  });

  it('positive control: something in this package really does import the browser subpath', async () => {
    // The rule above is satisfied vacuously by a package that imports `experiments` nowhere, and
    // that was this package's state until W4. Asserting a real import keeps the rule attached to
    // a real consumer: if `src/controls/` ever stops importing the barrel, this goes red and the
    // claim in DECISIONS.md that W4 is `browser.ts`'s non-test caller stops being true silently.
    const users = (await vizSources())
      .filter((file) => /from\s+['"]@elevator-sim\/experiments\/browser['"]/.test(file.code))
      .filter((file) => !isTest(file.id))
      .map((file) => file.id);
    expect(users.length).toBeGreaterThan(0);
  });
});
