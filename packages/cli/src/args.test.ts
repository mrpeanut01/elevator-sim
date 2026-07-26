import { describe, expect, it } from 'vitest';

import {
  booleanFlag,
  numberFlag,
  parseArgs,
  rejectPositionals,
  requiredStringFlag,
  stringFlag,
  type FlagSpec,
} from './args.js';
import { UsageError, didYouMean } from './errors.js';

const SPECS: readonly FlagSpec[] = [
  { name: 'building', kind: 'string', summary: 'which building', required: true },
  { name: 'dispatcher', kind: 'string', summary: 'which dispatcher', required: true },
  { name: 'seed', kind: 'integer', summary: 'master seed', min: 0 },
  { name: 'speed', kind: 'number', summary: 'multiplier', min: 0.1, max: 1000, defaultValue: 10 },
  {
    name: 'template',
    kind: 'string',
    summary: 'demand template',
    choices: ['rise-and-fall', 'constant-iso'],
  },
  { name: 'serial', kind: 'boolean', summary: 'no workers' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'help' },
];

const CONTEXT = 'elevator-sim test';

describe('parseArgs — valid input', () => {
  it('reads separated and inline values alike', () => {
    const separated = parseArgs(
      ['--building', 'garden-apartments', '--dispatcher', 'eta', '--seed', '42'],
      SPECS,
      CONTEXT,
    );
    const inline = parseArgs(
      ['--building=garden-apartments', '--dispatcher=eta', '--seed=42'],
      SPECS,
      CONTEXT,
    );
    expect(separated.values).toEqual(inline.values);
    expect(stringFlag(separated, 'building')).toBe('garden-apartments');
    expect(numberFlag(separated, 'seed')).toBe(42);
  });

  it('applies declared defaults and defaults booleans to false', () => {
    const parsed = parseArgs(['--building', 'b', '--dispatcher', 'd'], SPECS, CONTEXT);
    expect(numberFlag(parsed, 'speed')).toBe(10);
    expect(booleanFlag(parsed, 'serial')).toBe(false);
    expect(booleanFlag(parsed, 'help')).toBe(false);
  });

  it('accepts a bare boolean, an explicit one, and the --no- form', () => {
    const bare = parseArgs(['--building', 'b', '--dispatcher', 'd', '--serial'], SPECS, CONTEXT);
    expect(booleanFlag(bare, 'serial')).toBe(true);
    const explicit = parseArgs(
      ['--building', 'b', '--dispatcher', 'd', '--serial=false'],
      SPECS,
      CONTEXT,
    );
    expect(booleanFlag(explicit, 'serial')).toBe(false);
    const negated = parseArgs(
      ['--building', 'b', '--dispatcher', 'd', '--serial', '--no-serial'],
      SPECS,
      CONTEXT,
    );
    expect(booleanFlag(negated, 'serial')).toBe(false);
  });

  it('accepts single-letter aliases', () => {
    const parsed = parseArgs(['--building', 'b', '--dispatcher', 'd', '-h'], SPECS, CONTEXT);
    expect(booleanFlag(parsed, 'help')).toBe(true);
  });

  it('accepts a negative number as a value rather than reading it as a flag', () => {
    const specs: readonly FlagSpec[] = [{ name: 'offset', kind: 'number', summary: 'offset' }];
    expect(numberFlag(parseArgs(['--offset', '-3.5'], specs, CONTEXT), 'offset')).toBe(-3.5);
  });

  it('treats -- as the end of flags', () => {
    const parsed = parseArgs(
      ['--building', 'b', '--dispatcher', 'd', '--', '--not-a-flag'],
      SPECS,
      CONTEXT,
    );
    expect(parsed.positionals).toEqual(['--not-a-flag']);
  });
});

describe('parseArgs — bad input names the flag and the fix', () => {
  it('rejects an unknown flag and lists the known ones', () => {
    let thrown: unknown;
    try {
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--buidling', 'x'], SPECS, CONTEXT);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    const error = thrown as UsageError;
    expect(error.message).toContain('--buidling');
    expect(error.details.join('\n')).toContain('--building');
    expect(error.details.join('\n')).toContain('did you mean --building?');
  });

  it('reports a missing required flag by name', () => {
    expect(() => parseArgs(['--dispatcher', 'eta'], SPECS, CONTEXT)).toThrowError(
      /missing required flag --building/,
    );
  });

  it('reports a flag whose value is missing', () => {
    expect(() =>
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--seed'], SPECS, CONTEXT),
    ).toThrowError(/flag --seed needs a value/);
  });

  it('reports a non-numeric value for a numeric flag', () => {
    expect(() =>
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--seed', 'lucky'], SPECS, CONTEXT),
    ).toThrowError(/--seed expects a whole number; received "lucky"/);
  });

  it('reports a value outside a declared range', () => {
    expect(() =>
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--speed', '5000'], SPECS, CONTEXT),
    ).toThrowError(/--speed must be at most 1000/);
    expect(() =>
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--seed', '-1'], SPECS, CONTEXT),
    ).toThrowError(/--seed must be at least 0/);
  });

  it('lists the admissible values for an enumerated flag', () => {
    let thrown: unknown;
    try {
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--template', 'rise-and-fal'], SPECS, CONTEXT);
    } catch (error) {
      thrown = error;
    }
    const error = thrown as UsageError;
    expect(error.message).toContain('--template does not accept "rise-and-fal"');
    expect(error.details.join('\n')).toContain('rise-and-fall, constant-iso');
    expect(error.details.join('\n')).toContain('did you mean "rise-and-fall"?');
  });

  it('rejects a stray positional for a flags-only command', () => {
    const parsed = parseArgs(['--building', 'b', '--dispatcher', 'd', 'oops'], SPECS, CONTEXT);
    expect(() => rejectPositionals(parsed, CONTEXT)).toThrowError(/unexpected argument "oops"/);
  });

  it('rejects --no- on a flag that takes a value', () => {
    expect(() =>
      parseArgs(['--building', 'b', '--dispatcher', 'd', '--no-seed'], SPECS, CONTEXT),
    ).toThrowError(/unknown flag "--no-seed"/);
  });

  it('requiredStringFlag throws rather than returning a plausible empty string', () => {
    const parsed = parseArgs(['--building', 'b', '--dispatcher', 'd'], SPECS, CONTEXT);
    expect(() => requiredStringFlag(parsed, 'template')).toThrowError(UsageError);
  });
});

describe('didYouMean', () => {
  it('suggests a near miss and stays quiet about a far one', () => {
    expect(didYouMean('buidling', ['building', 'dispatcher'])).toBe('building');
    expect(didYouMean('zzzzzzzzzz', ['building', 'dispatcher'])).toBeUndefined();
  });
});
