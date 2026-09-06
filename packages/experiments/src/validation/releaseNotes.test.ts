/**
 * `RELEASE_NOTES.md` keeps the shape the build line depends on — GitHub issue #246.
 *
 * The Settings panel says *Build <commit>* and the notes are keyed by commit, so the two agree
 * only while every heading is a commit and the file stays newest-first. A heading that is a date
 * alone, or an entry pasted above an older one, would leave a reporter with a build they cannot
 * find. This is a shape check and nothing more: it does not resolve the commits against git,
 * because CI checks out one commit and the file names dozens.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const HEADING = /^## ([0-9a-f]{7,10}) \((\d{4}-\d{2}-\d{2})\)$/u;

function entriesOf(): readonly { readonly sha: string; readonly date: string }[] {
  const text = readFileSync(join(ROOT, 'RELEASE_NOTES.md'), 'utf8');
  return text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => {
      const match = HEADING.exec(line);
      if (match === null) throw new Error(`a release-notes heading is not "## <commit> (<date>)": ${line}`);
      return { sha: match[1] ?? '', date: match[2] ?? '' };
    });
}

describe('RELEASE_NOTES.md', () => {
  it('has at least one entry, every heading a commit and a date', () => {
    expect(entriesOf().length).toBeGreaterThan(0);
  });

  it('is newest-first, so the top entry is the deployed build', () => {
    const dates = entriesOf().map((entry) => entry.date);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(dates).toEqual(sorted);
  });

  it('names each commit once', () => {
    const shas = entriesOf().map((entry) => entry.sha);
    expect(new Set(shas).size).toBe(shas.length);
  });
});
