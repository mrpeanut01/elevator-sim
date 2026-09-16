import { describe, expect, it } from 'vitest';

import {
  appendTtiRecord,
  parseTtiHistory,
  recordsOnBranch,
  serializeTtiRecord,
  TtiHistoryParseError,
  type TtiRecord,
} from './ttiHistory.js';

const VALID_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

const record = (overrides: Partial<TtiRecord> = {}): TtiRecord => ({
  commit: VALID_SHA,
  branch: 'main',
  timestampMs: 1_757_000_000_000,
  ttiMs: 2_400,
  ci: true,
  ...overrides,
});

describe('parseTtiHistory', () => {
  it('parses an empty store as no records — the state this repository ships in', () => {
    expect(parseTtiHistory('')).toEqual([]);
  });

  it('parses one record per line, in file order', () => {
    const a = record({ commit: VALID_SHA, ttiMs: 2_000 });
    const b = record({ commit: OTHER_SHA, ttiMs: 2_100 });
    const text = `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`;
    expect(parseTtiHistory(text)).toEqual([a, b]);
  });

  it('skips blank lines, including a trailing newline', () => {
    const a = record();
    const text = `\n${JSON.stringify(a)}\n\n`;
    expect(parseTtiHistory(text)).toEqual([a]);
  });

  it('throws on a line that is not valid JSON, naming the line number', () => {
    const text = `${JSON.stringify(record())}\nnot json\n`;
    expect(() => parseTtiHistory(text)).toThrow(TtiHistoryParseError);
    try {
      parseTtiHistory(text);
      expect.unreachable('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(TtiHistoryParseError);
      expect((error as TtiHistoryParseError).lineNumber).toBe(2);
    }
  });

  it('throws on a line that is valid JSON but fails the schema — a malformed row is never silently dropped', () => {
    const bad = { ...record(), commit: 'too-short' };
    expect(() => parseTtiHistory(`${JSON.stringify(bad)}\n`)).toThrow(TtiHistoryParseError);
  });

  it('rejects an unrecognized field, per the strict schema', () => {
    const withExtra = { ...record(), extra: true };
    expect(() => parseTtiHistory(`${JSON.stringify(withExtra)}\n`)).toThrow(TtiHistoryParseError);
  });

  it('rejects a negative ttiMs', () => {
    const bad = { ...record(), ttiMs: -1 };
    expect(() => parseTtiHistory(`${JSON.stringify(bad)}\n`)).toThrow(TtiHistoryParseError);
  });
});

describe('serializeTtiRecord', () => {
  it('round-trips through parseTtiHistory', () => {
    const original = record({ commit: OTHER_SHA, ttiMs: 1_234.5 });
    const line = serializeTtiRecord(original);
    expect(parseTtiHistory(`${line}\n`)).toEqual([original]);
  });

  it('sorts keys, so two records differ in the diff only where their values differ', () => {
    const line = serializeTtiRecord(record());
    const keys = Object.keys(JSON.parse(line) as Record<string, unknown>);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('appendTtiRecord', () => {
  it('appends to an empty store without a leading blank line', () => {
    const result = appendTtiRecord('', record());
    expect(result).toBe(`${serializeTtiRecord(record())}\n`);
    expect(parseTtiHistory(result)).toEqual([record()]);
  });

  it('appends after existing content, adding a trailing newline if the store lacked one', () => {
    const first = record({ commit: VALID_SHA });
    const second = record({ commit: OTHER_SHA });
    const withoutTrailingNewline = serializeTtiRecord(first); // no trailing \n
    const result = appendTtiRecord(withoutTrailingNewline, second);
    expect(parseTtiHistory(result)).toEqual([first, second]);
  });

  it('does not disturb existing lines when appending twice', () => {
    let text = '';
    const records = [
      record({ commit: VALID_SHA, ttiMs: 1 }),
      record({ commit: OTHER_SHA, ttiMs: 2 }),
    ];
    for (const r of records) text = appendTtiRecord(text, r);
    expect(parseTtiHistory(text)).toEqual(records);
  });
});

describe('recordsOnBranch', () => {
  it('filters to the named branch only', () => {
    const onMain = record({ branch: 'main', commit: VALID_SHA });
    const onPr = record({ branch: 'issue-408', commit: OTHER_SHA });
    expect(recordsOnBranch([onMain, onPr], 'main')).toEqual([onMain]);
  });

  it('returns an empty list when nothing matches, rather than throwing', () => {
    expect(recordsOnBranch([record({ branch: 'feature' })], 'main')).toEqual([]);
  });
});
