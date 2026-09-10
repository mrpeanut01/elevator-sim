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
 *
 * **The second half, added when the first half proved incomplete.** Stripping *member access* left
 * *member declaration* untouched, so `render/overlay.ts` — which declares `readonly window: string`
 * for the very `RunSummary.window` the paragraph above is about — tripped the rule the paragraph
 * above exists to stop it tripping. The field could be read as `x.window` and not declared, which
 * is not a coherent rule about a codebase.
 *
 * So a declared name is stripped too, and the narrowing is kept tight by **where** the name sits:
 * a property key or a declaration is preceded by a line start, `readonly`, `{`, `,` or `;`, and
 * followed by `:` or `?:`. That deliberately excludes `cond ? window : other`, where `window` is a
 * bare global in value position preceded by `?` — pinned in the negative control below, because a
 * narrowing that swallowed the ternary would be a rule with a hole shaped exactly like a real use.
 */
function stripMemberNames(text: string): string {
  return text
    .replace(/\.\s*[A-Za-z_$][\w$]*/g, '.')
    .replace(/(^|[{,;]|\breadonly)(\s*)[A-Za-z_$][\w$]*(\s*\??\s*:)/gm, '$1$2$3');
}

/** Files whose job is to touch the outside world. */
const isTest = (id: string): boolean => id.endsWith('.test.ts') || id.endsWith('.test-helper.ts');

/**
 * The Everyday shell's DOM-owning files — the second shell, exempted by name.
 *
 * `everyday/` is an entry point in the same sense `dev/` is: `boot.ts` is what `index.html` loads,
 * `shell.ts` builds the rail, the screen region and the action bar, and `fixitScreen.ts` is a
 * registered screen's mount — the DOM half of a pure/DOM split whose words live in
 * `fixitScreenModel.ts` (it is here for its one-frame `setTimeout` defer, `dev/fixitPanel.ts`'s
 * stated-cost approach carried over). What is *not* exempt is the rest of the directory —
 * `types.ts`, `modes.ts`, `rail.ts` and `fixitScreenModel.ts` are pure decisions about what the
 * shell shows, kept free of the document precisely so they can be tested in this node tier, and
 * the rules below are what hold them there.
 *
 * So the exemption is **file names rather than a `startsWith('everyday/')`**. A prefix would have
 * exempted a directory that is mostly pure, and the day one of the pure files reached for a
 * `document` this suite would have said nothing.
 */
const EVERYDAY_SHELL_FILES = new Set([
  'everyday/boot.ts',
  /*
   * The page's two global fault listeners — GitHub issue #242. Here rather than in `everyday/`'s
   * pure half for exactly the reason this set exists: it installs on a `window`, and the counting
   * it feeds is `everyday/faults.ts`, which touches no document and is deliberately **not** on this
   * list. That split is what lets the register be driven in this node tier at all.
   */
  'everyday/faultWatch.ts',
  'everyday/shell.ts',
  /* The fixit screen's DOM half — its words and decisions stay pure in fixitScreenModel.ts. */
  'everyday/fixitScreen.ts',
  /* The settings screen's DOM half — its words and decisions stay pure in settingsView.ts. */
  'everyday/settingsScreen.ts',
  /* GAMEPLAY § 8's three campaign screens — their words stay pure in campaignModel.ts. */
  'everyday/campaignScreens.ts',
  /*
   * The § 7 stage's DOM half — its words, its figures and its geometry stay pure in
   * stageScreenModel.ts. It is the one Everyday file that also holds a `requestAnimationFrame`
   * loop, which is the whole reason the split is drawn where it is: the transport belongs to the
   * shell tier and everything a reader reads does not.
   */
  'everyday/stageScreen.ts',
  /*
   * The stage's canvas painter and sizing, moved out of `stageScreen.ts` for GitHub issue #348 so
   * the fix-it screen's as-built stage paints with the same one. `sizeCanvas` reads a bounding
   * rect and a device pixel ratio, which is the DOM half the stage always had; the words it draws
   * are the model's, pinned by `stageScreen.test.ts` against this file.
   */
  'everyday/cutaway.ts',
  /* The brief's elevation painter, shared with the campaign's tower screen since GitHub issue #353; it sizes a canvas. */
  'everyday/elevation.ts',
  /* The § 11 workshop's DOM half — its words and decisions stay pure in workshopModel.ts. */
  'everyday/workshopScreen.ts',
  /* The § 12 bench's DOM half — its words stay pure in benchModel.ts, and it owns a batch Worker. */
  'everyday/benchScreen.ts',
  /* The rush setup screen's DOM half — its ramp arithmetic and words stay in rushScreenModel.ts. */
  'everyday/rushScreen.ts',
  /* The drawing board's DOM half — its figures, steps and warnings stay in designerModel.ts. */
  'everyday/designerScreen.ts',
  /* The tuner's DOM half — its seven controls and their seams stay in tunerModel.ts. */
  'everyday/tunerScreen.ts',
  /* The one place Everyday touches window.localStorage; profile.ts itself is storage-agnostic. */
  'everyday/careerStore.ts',
  'everyday/profileStore.ts',
  /*
   * § 6's daily loop — four DOM halves and the vocabulary they share. Each one's words and
   * decisions stay pure in its `*View.ts` sibling (`doorView`, `briefView`, `reportView`,
   * `weekView`) plus `today.ts`, `figures.ts` and `world.ts`, none of which are exempt and all of
   * which are driven in this node tier.
   *
   * `briefScreen.ts` is here for a second reason worth naming: it is the only Everyday file that
   * draws to a canvas, so it reads `devicePixelRatio` and a `resize` listener off the document's
   * own view — ENGINE_CONTRACT § 14's rules, which cannot be followed without touching them.
   */
  'everyday/screenDom.ts',
  /*
   * GitHub issue #244's landing page. Its words are pure in `everyday/landingView.ts`, which is not
   * exempt and is driven in this node tier; the mount is here because it draws to a canvas — the
   * second file in `everyday/` to do so, after `briefScreen.ts` — so it reads `devicePixelRatio`
   * and asks the document's own view for animation frames, and it spawns the worker its run
   * crosses. None of the three can be done without touching the DOM.
   */
  'everyday/landingScreen.ts',
  'everyday/doorScreen.ts',
  'everyday/briefScreen.ts',
  'everyday/reportScreen.ts',
  'everyday/weekScreen.ts',
  /*
   * Telemetry's DOM half — GitHub issue #340. `telemetry/` is pure: the schema, the consent slot,
   * the batching recorder and the ask's words are all drivable by a node test. This file is the
   * four things only a browser has — `localStorage`, `crypto.getRandomValues`, `fetch` and the
   * `<meta>` tag naming the API origin — and it is the only place any of them is reached.
   */
  'everyday/telemetryPort.ts',
]);

/** A shell entry point: `dev/` wholesale, and the Everyday shell's DOM-owning files. */
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
    // A ternary puts a bare global in value position with a colon after it, which is the shape the
    // declaration half of the narrowing must not swallow. Pinned here rather than trusted.
    for (const stillCaught of ['cond ? window : other', 'const x = ok ? document : null;']) {
      expect(DOM_PATTERN.test(stripMemberNames(stillCaught)), stillCaught).toBe(true);
    }
    for (const allowed of [
      'summary.window.startS',
      'result.summary.window',
      'a.document.b',
      // The declaration half — `render/overlay.ts`'s own field, and the shapes it appears in.
      'readonly window: string;',
      '{ window: string }',
      'interface X {\n  window: string;\n}',
      'const view = { window: caption, other: 1 };',
    ]) {
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

/* -------------------------------------------------------------------------- *
 * § D529 clause 4 — a worked answer is permitted in the tutorial and nowhere else
 * -------------------------------------------------------------------------- */

/**
 * **The one boundary the product owner asked to have written down once**, as a build failure.
 *
 * [§ D529](../../../DECISIONS.md) clause 4, given directly — *"Also agreed, **write the boundary
 * down once**"*:
 *
 * > A worked answer is permitted in the tutorial and nowhere else. No hint control, no suggested
 * > fix, no diagnosis line, and no *here is what we would have done*, in any scenario, in any mode,
 * > at any ladder position.
 *
 * [§ D525](../../../DECISIONS.md) clause 2 retires proposed fixes from every scenario — the
 * four-repair menu, the five decoys, and the printed line saying what kind of fix it is — and the
 * tutorial shows one anyway, because a tutorial teaches and a scenario does not. The clause exists
 * because **without it the tutorial's teaching component is reused as a hint button on scenario
 * twelve and the thing § D525 scrapped returns through the side door**, and a sentence in a
 * decision file cannot stop that. An allowlist can.
 *
 * Two rules, because the component has two halves and each can be borrowed on its own: the words
 * (`everyday/workedAnswer.ts`) and the mount that runs the pair and draws them
 * (`everyday/tutorialScreens.ts#mountWorkedAnswer`). A scenario surface that imported either would
 * be able to answer for the player.
 *
 * **`everyday/tutorialScreens.ts` is on the first list for one string and no more**, and the
 * distinction is worth reading rather than counting. It takes `WorkedAnswerFacts` and
 * `WorkedAnswerView` as **types** and never calls `workedAnswerViewOf`: the only value it imports
 * is `WORKED_ANSWER_COPY.pending`, the line the component draws before its two runs land, which
 * belongs to the component rather than to either screen for the reason that constant carries. So
 * the file that *draws* the answer still cannot *word* one, and the only two places that can say
 * what would have fixed a building are § D529 clause 2's two entry points.
 *
 * **The sweep is on the words' list and is not an exception to the rule.** `honesty/surfaces.ts`
 * renders every player-facing string in this product and draws none of them to anybody; it is on
 * `SERVER_READERS` above for exactly the same reason. A rule that excluded it would be a rule that
 * un-swept the one surface most in need of sweeping.
 */
const WORKED_ANSWER_READERS: readonly string[] = Object.freeze([
  // § D529 clause 2's two entry points: the rush's, and the tutorial's own.
  'everyday/rushScreenModel.ts',
  'everyday/tutorialModel.ts',
  // Screen two's mount, for the pending line the component owns and for nothing else — see above.
  'everyday/tutorialScreens.ts',
  // The sweep, which drives both entry points and reads the words to nobody.
  'honesty/surfaces.ts',
]);

/** Who may draw the component — screen two, and § D529 clause 2's one reuse. */
const WORKED_ANSWER_MOUNTERS: readonly string[] = Object.freeze([
  'everyday/rushScreen.ts',
  'everyday/tutorialScreens.ts',
]);

describe('§ D529 clause 4 — the worked answer is the tutorial’s and nobody else’s', () => {
  it('confines the words to the two entry points, screen two and the sweep', async () => {
    const readers = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) =>
        /import\s+(?!type\b)[^;]*from\s+['"][^'"]*workedAnswer\.js['"]/.test(file.code),
      )
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      readers,
      'a module outside the tutorial gained the worked answer. § D529 clause 4 permits one in the ' +
        'tutorial and nowhere else — no hint control, no suggested fix, no diagnosis line, and no ' +
        '“here is what we would have done”, in any scenario, in any mode, at any ladder position. ' +
        'If this is a third tutorial surface the owner has ruled on, add it here with the ruling; ' +
        'otherwise the surface should hand the player the building, the letter and the editor.',
    ).toEqual([...WORKED_ANSWER_READERS]);
  });

  it('confines the component to screen two and the rush tutorial', async () => {
    const mounters = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) => file.id !== 'everyday/tutorialScreens.ts')
      .filter((file) => /\bmountWorkedAnswer\b/.test(file.identifiers))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    // The declaring module is filtered out above, so the list is the *importers* — and it must be
    // exactly the one reuse § D529 clause 2 names.
    expect(
      mounters,
      'a module outside the tutorial gained the worked answer’s mount. See the clause quoted above; ' +
        'the second use is the Rush tutorial and § D529 clause 2 names it, so a third is a ruling ' +
        'somebody has to make rather than an import somebody can add.',
    ).toEqual(WORKED_ANSWER_MOUNTERS.filter((id) => id !== 'everyday/tutorialScreens.ts'));
  });

  it('positive control: the grep finds the imports it is supposed to be confining', async () => {
    /*
     * This file's own habit — a rule whose regex quietly stopped matching would pass forever. Both
     * lists are asserted non-empty against the tree rather than against themselves, so a renamed
     * module or a changed specifier is red here rather than silently permissive above.
     */
    const sources = await vizSources();
    expect(sources.filter((file) => file.id === 'everyday/workedAnswer.ts')).toHaveLength(1);
    expect(sources.filter((file) => file.id === 'everyday/tutorialScreens.ts')).toHaveLength(1);
    expect(WORKED_ANSWER_READERS.length).toBeGreaterThan(1);
    expect(WORKED_ANSWER_MOUNTERS.length).toBe(2);
    /*
     * The narrower claim the paragraph above makes, checked rather than asserted in prose: the
     * mount imports the component's copy table and does not word an answer. A file that gained
     * `workedAnswerViewOf` would be a third place the product could say what it would have done,
     * and the allowlist above cannot see that on its own because the module is already on it.
     */
    const mount = sources.find((file) => file.id === 'everyday/tutorialScreens.ts');
    expect(/\bworkedAnswerViewOf\b/.test(mount?.identifiers ?? '')).toBe(false);
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

/* -------------------------------------------------------------------------- *
 * § D526 clause 5 — the play surface never learns a source (GitHub issue #368)
 * -------------------------------------------------------------------------- */

/**
 * The chime ledger's **source** vocabulary, read off the shipped table rather than transcribed.
 *
 * *The play surface reads one balance and posts two verbs, earn and spend, and never knows a
 * source* ([§ D526](../../../DECISIONS.md) clause 5). This is that rule as a grep, and the whole of
 * it turns on two words this repository keeps apart on purpose:
 *
 * - a **completion** is what the play surface names — *a scenario cleared* — and every module here
 *   is free to say one;
 * - a **source** is what the ledger calls the entry it wrote — *earn-scenario-clear* — and no
 *   module here may say one at all.
 *
 * Derived from `data/chime-ledger.json` rather than listed here, on
 * `validation/documentation.test.ts`'s own rule for the carrier set it checks: a source added to
 * the table joins this rule on the commit that adds it, and a module that names it cannot escape by
 * not being on a list. **That is also what makes an add from outside invisible to play** — the
 * property the whole clause exists for. A purchase, a gift, an operator's correction: each would be
 * one more source on the same ledger, and nothing here could name it, so nothing here could draw a
 * different sentence because of it.
 */
async function chimeSourceIds(): Promise<readonly string[]> {
  const raw = await readFile(join(REPO_ROOT, 'data', 'chime-ledger.json'), 'utf8');
  const table = JSON.parse(raw) as { sources: readonly { id: string }[] };
  return table.sources.map((source) => source.id);
}

describe('§ D526 clause 5 — the balance is all the play surface knows', () => {
  it('names no chime source anywhere in this package', async () => {
    const sources = await chimeSourceIds();
    const offenders = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) => sources.some((id) => file.code.includes(id)))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      offenders,
      'a module in the viewer names a chime source. § D526 clause 5: the play surface reads one ' +
        'balance and posts earn and spend, and never learns where an entry came from — which is ' +
        'what makes an add from outside invisible to play. If this module needs to say what the ' +
        'player finished, it should name a completion (scenario cleared, contract day paid, rush ' +
        'wave survived); if it needs a balance, it should read the one number the account answers.',
    ).toEqual([]);
  });

  it('reaches no source list, which a name grep alone could not have told it', async () => {
    /*
     * **The hole the review of PR #485 measured, closed.** The rule above greps for source *ids*,
     * and `everyday/chimesPanel.ts` imported the whole `data/chime-ledger.json` and exported the
     * parsed table — so `CHIME_LEDGER.sources[i].name` drew a source's name to a player through one
     * property access, spelling no id at all, with nothing going red. Four of the five ways a
     * module could learn a source went uncaught; only a literal id was seen.
     *
     * A grep over names cannot catch a grep-free path to the same data, so this is a grep over the
     * **path**: nothing in this package may reach a `.sources` at all — not off a parsed table, not
     * off a raw JSON import. The panel's own half of the fix is in `core`
     * (`chimeSpendTableOf`), which projects the sources away before the module holds anything, so
     * the two rules together mean there is no binding here that has one and no expression here that
     * could read one.
     *
     * Deliberately not narrowed to the ledger: `.sources` on any document in this package is the
     * same shape, and a rule that named one file would be a rule about that file.
     */
    /*
     * Three shapes, because the docstring above says *not at all* and a dotted read alone does not
     * mean that. `chimesPanel.ts` still imports the raw JSON, so `chimeLedgerDocument['sources']`
     * is a live path in the one file holding the document, and a destructure hides the word behind
     * a binding — both were measured as escaping the first spelling of this guard.
     */
    const reaching = /[.[]\s*['"]?sources\b|\bsources\s*[,}]/u;
    const offenders = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) => reaching.test(file.code))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      offenders,
      'a module in the viewer reads a `.sources`. § D526 clause 5: the play surface never learns ' +
        'where an entry came from, and a property access is a way of learning it that no grep over ' +
        'source names can see. A module that needs the prices should import the projection — ' +
        '`core`\u2019s `chimeSpendTableOf`, which `everyday/chimesPanel.ts` applies to the parse ' +
        'expression itself so that nothing here ever holds a table with sources on it.',
    ).toEqual([]);
  });

  it('positive control: that rule really catches a property access', () => {
    /*
     * Assembled rather than written out, on this block's own habit: the rule reads
     * comment-stripped-but-string-intact source and exempts only tests by name, so spelling the
     * expression here would make this file its first offender the day somebody widened the filter.
     */
    /*
     * Three shapes, because the docstring above says *not at all* and a dotted read alone does not
     * mean that. `chimesPanel.ts` still imports the raw JSON, so `chimeLedgerDocument['sources']`
     * is a live path in the one file holding the document, and a destructure hides the word behind
     * a binding — both were measured as escaping the first spelling of this guard.
     */
    const reaching = /[.[]\s*['"]?sources\b|\bsources\s*[,}]/u;
    const property = ['const paid = table', 'sources[0].name;'].join('.');
    expect(reaching.test(property), 'the detector misses a property access').toBe(true);
    expect(reaching.test('const rows = table.sinks.map(price);'), 'the detector is too wide').toBe(false);
  });

  it('reads no ledger entry, and has no shape to put one in', async () => {
    /*
     * The other half of the same clause and the one a screen would breach first. A history, a
     * breakdown, a *where this came from* — each needs the entries, and the server serves a balance
     * and nothing else. Asserted over the words a client would have to use to ask.
     */
    const asking = /chimeEntries|ledgerEntries|chimeHistory|chimeSources|earnedFrom/;
    const offenders = (await vizSources())
      .filter((file) => !isTest(file.id))
      .filter((file) => asking.test(file.identifiers))
      .map((file) => file.id);
    expect(
      offenders,
      'a module in the viewer asks the ledger for its entries. There is no route that answers ' +
        'one, on purpose — see § D526 clause 5 and the balance route’s own docstring.',
    ).toEqual([]);
  });

  it('positive control: the source ids are real, and the grep would catch one', async () => {
    /*
     * This file's own habit, and it matters more here than usual: a rule keyed on a list read off
     * disk passes vacuously the day the list comes back empty. Both halves are asserted — the table
     * really has sources, and the detector really catches a module that names one.
     *
     * The literal is **assembled** rather than written out, because the rule above reads
     * comment-stripped-but-string-intact source and exempts only tests by name; spelling a source
     * id here would make this file the first offender the day somebody widened the filter.
     */
    const sources = await chimeSourceIds();
    /*
     * **Every id, not the first one.** This read `expect(sources.length).toBeGreaterThan(2)` and
     * then built one offending line out of `sources[0]`, which the review of PR #485 named as a
     * vacuity guard that is itself vacuous: deleting a source left three and nothing went red, and
     * an id the detector happened to miss would never have been tried. The existence of each
     * shipped source is asserted where the table is parsed — `core`'s `chimeLedger.test.ts` requires
     * a gift and one source per completion, so a deleted source is red there — and what this owes
     * is that the **detector** works on all of them.
     */
    expect(sources.length).toBeGreaterThan(2);
    for (const id of sources) {
      expect(id.startsWith('earn-') || id.startsWith('gift-'), id).toBe(true);
      const wouldOffend = `const paid = ${JSON.stringify(id)};`;
      expect(sources.some((candidate) => wouldOffend.includes(candidate)), id).toBe(true);
    }

    /* And the completion vocabulary, which this rule must NOT catch, is genuinely different. */
    const completion = ['scenario', 'cleared'].join('-');
    expect(sources.some((id) => completion.includes(id))).toBe(false);
  });

  it('positive control: the panel that draws the balance is really in the tree', async () => {
    /* A rule confining a surface that does not exist confines nothing. */
    const files = (await vizSources()).map((file) => file.id);
    expect(files).toContain('everyday/chimesPanel.ts');
    expect(files).toContain('everyday/settingsView.ts');
  });
});
