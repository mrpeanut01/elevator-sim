/**
 * A deliberately small YAML reader, sufficient for a GitHub Actions workflow and nothing else.
 *
 * ## Why this exists rather than a dependency
 *
 * `scripts/review-gates.mjs` sets the precedent this follows: it reads source with `node:fs` and
 * nothing else, *"so they must not be able to fail for a reason unrelated to the code under
 * review."* The same argument applies here with more force — this file's whole subject is whether
 * `.github/workflows/ci.yml` still describes a two-platform comparison, and a guard that needs
 * `npm ci` to answer that cannot run when `npm ci` is what broke.
 *
 * The repository has no `yaml` dependency and this does not add one.
 *
 * ## What it supports, and what it refuses
 *
 * Block mappings, block sequences, flow sequences (`[a, b]`), single- and double-quoted scalars,
 * literal and folded block scalars (`|`, `>`), `true`/`false`, comments, and empty values.
 *
 * It refuses everything else **by throwing**, which is the only property that matters: a reader
 * that silently returns `undefined` for a construct it does not understand turns every assertion
 * downstream into a vacuous pass. Anchors, aliases, multi-document streams, flow mappings and tags
 * are not supported and are not silently ignored.
 *
 * Two deliberate divergences from YAML 1.1, both in the direction of being more useful here:
 * `on` stays the string key `'on'` rather than becoming boolean `true`, and unquoted numbers stay
 * strings, because a workflow's `node-version: '26'` and `node-version: 26` must not compare equal
 * by accident.
 */

/** @typedef {string | boolean | null | YamlValue[] | { [key: string]: YamlValue }} YamlValue */

const KEY = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?:\s+(.*))?$/;

/**
 * Remove a trailing ` # comment`, but only outside quotes and outside a `${{ }}` expression.
 *
 * GitHub expressions do not contain `#` today; the guard is here because the failure mode of
 * getting this wrong is a truncated `runs-on` that still parses, which is precisely the class of
 * silently-wrong result this file exists to avoid.
 */
function stripInlineComment(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (text.startsWith('${{', i)) {
      depth += 1;
      i += 2;
      continue;
    }
    if (text.startsWith('}}', i) && depth > 0) {
      depth -= 1;
      i += 1;
      continue;
    }
    if (c === '#' && depth === 0 && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text;
}

function unquote(text, where) {
  const q = text[0];
  if (q !== '"' && q !== "'") return text;
  if (text.length < 2 || text[text.length - 1] !== q) {
    throw new Error(`miniYaml: unterminated ${q} string at line ${String(where)}: ${text}`);
  }
  const body = text.slice(1, -1);
  return q === "'" ? body.replaceAll("''", "'") : body.replaceAll('\\"', '"');
}

function parseScalar(text, where) {
  if (text === '' || text === '~' || text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) {
      throw new Error(`miniYaml: unterminated flow sequence at line ${String(where)}: ${text}`);
    }
    const inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((part) => parseScalar(part.trim(), where));
  }
  if (text.startsWith('{')) {
    throw new Error(`miniYaml: flow mappings are not supported (line ${String(where)}): ${text}`);
  }
  if (text.startsWith('&') || text.startsWith('*') || text.startsWith('!')) {
    throw new Error(`miniYaml: anchors, aliases and tags are not supported (line ${String(where)})`);
  }
  return unquote(text, where);
}

function tokenize(source) {
  return source.split('\n').map((raw, index) => ({
    raw,
    lineNo: index + 1,
    indent: raw.length - raw.trimStart().length,
    text: stripInlineComment(raw.trim()),
  }));
}

const isBlank = (token) => token.text === '' || token.text.startsWith('#');

function skipBlanks(lines, state) {
  while (state.i < lines.length && isBlank(lines[state.i])) state.i += 1;
}

/** Read a `|` / `>` block scalar: every following line indented deeper than the owning key. */
function readBlockScalar(lines, state, ownerIndent, fold) {
  const body = [];
  let childIndent = null;
  while (state.i < lines.length) {
    const token = lines[state.i];
    if (token.raw.trim() === '') {
      body.push('');
      state.i += 1;
      continue;
    }
    if (token.indent <= ownerIndent) break;
    childIndent ??= token.indent;
    body.push(token.raw.slice(childIndent));
    state.i += 1;
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  return fold ? body.join(' ') : `${body.join('\n')}\n`;
}

function parseMapping(lines, state, indent) {
  /** @type {Record<string, YamlValue>} */
  const map = {};
  for (;;) {
    skipBlanks(lines, state);
    if (state.i >= lines.length) break;
    const token = lines[state.i];
    if (token.indent < indent) break;
    if (token.indent > indent) {
      throw new Error(`miniYaml: unexpected indent at line ${String(token.lineNo)}: ${token.raw}`);
    }
    if (token.text.startsWith('- ') || token.text === '-') break;
    const match = KEY.exec(token.text);
    if (match === null) {
      throw new Error(`miniYaml: not a mapping entry at line ${String(token.lineNo)}: ${token.text}`);
    }
    const key = match[1];
    const rest = (match[2] ?? '').trim();
    if (Object.hasOwn(map, key)) {
      throw new Error(`miniYaml: duplicate key '${key}' at line ${String(token.lineNo)}`);
    }
    state.i += 1;
    if (rest === '|' || rest === '|-' || rest === '|+') {
      map[key] = readBlockScalar(lines, state, indent, false);
    } else if (rest === '>' || rest === '>-' || rest === '>+') {
      map[key] = readBlockScalar(lines, state, indent, true);
    } else if (rest === '') {
      map[key] = parseChild(lines, state, indent);
    } else {
      map[key] = parseScalar(rest, token.lineNo);
    }
  }
  return map;
}

function parseSequence(lines, state, indent) {
  /** @type {YamlValue[]} */
  const items = [];
  for (;;) {
    skipBlanks(lines, state);
    if (state.i >= lines.length) break;
    const token = lines[state.i];
    if (token.indent < indent) break;
    if (token.indent > indent) {
      throw new Error(`miniYaml: unexpected indent at line ${String(token.lineNo)}: ${token.raw}`);
    }
    if (!token.text.startsWith('- ') && token.text !== '-') break;
    if (token.text === '-') {
      state.i += 1;
      items.push(parseChild(lines, state, indent));
      continue;
    }
    const inner = token.text.slice(2);
    const innerIndent = indent + 2;
    if (KEY.test(inner)) {
      // `- key: value` opens a mapping whose first key sits two columns right of the dash. Rewrite
      // the line to that shape and let the mapping parser take it, so `- uses: x` followed by an
      // aligned `with:` reads as one map rather than two.
      lines[state.i] = { ...token, indent: innerIndent, text: inner, raw: ' '.repeat(innerIndent) + inner };
      items.push(parseMapping(lines, state, innerIndent));
      continue;
    }
    state.i += 1;
    items.push(parseScalar(inner, token.lineNo));
  }
  return items;
}

function parseChild(lines, state, parentIndent) {
  const save = state.i;
  skipBlanks(lines, state);
  if (state.i >= lines.length || lines[state.i].indent <= parentIndent) {
    state.i = save;
    return null;
  }
  const indent = lines[state.i].indent;
  const first = lines[state.i];
  return first.text.startsWith('- ') || first.text === '-'
    ? parseSequence(lines, state, indent)
    : parseMapping(lines, state, indent);
}

/**
 * Parse a single-document YAML subset into plain JavaScript values.
 *
 * @param {string} source
 * @returns {Record<string, YamlValue>}
 */
export function parseYaml(source) {
  const lines = tokenize(source);
  const state = { i: 0 };
  skipBlanks(lines, state);
  if (state.i >= lines.length) throw new Error('miniYaml: the document is empty');
  if (lines[state.i].text === '---') state.i += 1;
  const value = parseMapping(lines, state, lines[state.i]?.indent ?? 0);
  skipBlanks(lines, state);
  if (state.i < lines.length) {
    throw new Error(
      `miniYaml: trailing content the parser did not consume, from line ${String(lines[state.i].lineNo)}`,
    );
  }
  return value;
}
