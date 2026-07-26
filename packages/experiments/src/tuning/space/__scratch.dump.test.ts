import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { searchSpace } from './collect.js';
import * as core from '@elevator-sim/core';

describe('dump', () => {
  it('dumps', () => {
    const s = searchSpace();
    const lines: string[] = ['COUNT ' + s.parameters.length];
    for (const p of s.parameters) {
      lines.push([p.id, p.type, JSON.stringify(p.activeWhen ?? null), p.declaredBy.join(',')].join(' | '));
    }
    for (const [name, v] of Object.entries(core)) {
      if (!name.endsWith('_PARAMETERS')) continue;
      if (!Array.isArray(v)) continue;
      lines.push(name + ' [' + (v as {id:string}[]).length + '] ' + (v as {id:string}[]).map(r => r.id).join(' '));
    }
    writeFileSync('/private/tmp/claude-501/-Users-nrene-Documents-Development-04-personal-projects-elevator-sim/0e7aa08a-a3ae-4db5-aabe-37b057393236/scratchpad/space-dump.txt', lines.join('\n'));
  });
});
