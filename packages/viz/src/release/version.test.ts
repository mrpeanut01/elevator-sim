/**
 * GitHub issue #246 — the build line under test, where no bundler has substituted a value.
 */

import { describe, expect, it } from 'vitest';

import { BUILD_VERSION, UNBUILT, buildVersionLineOf } from './version.js';

describe('BUILD_VERSION', () => {
  it('reads as a ten-character commit or as the unbuilt value, never as anything else', () => {
    expect(BUILD_VERSION === UNBUILT || /^[0-9a-f]{7,10}$/u.test(BUILD_VERSION)).toBe(true);
  });
});

describe('buildVersionLineOf', () => {
  it('names the commit on a built copy, and asks the reader to quote it', () => {
    const line = buildVersionLineOf('7cc199bd12');
    expect(line).toContain('7cc199bd12');
    expect(line).toMatch(/quote/iu);
  });

  it('explains the absence on an unbuilt copy rather than drawing a placeholder', () => {
    const line = buildVersionLineOf(UNBUILT);
    expect(line).not.toContain(UNBUILT);
    expect(line).toMatch(/not built for release/u);
  });
});
