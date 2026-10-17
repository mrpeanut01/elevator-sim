import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWeekPool, poolLevelReadingOf } from './weekPool.js';
it('eval', () => {
  const pool = parseWeekPool(JSON.parse(readFileSync(process.env['EVAL_POOL']!, 'utf8')));
  const out: string[] = [];
  for (const w of [2, 3, 4]) {
    const r = poolLevelReadingOf('c2', w, pool);
    if (r === undefined) { out.push(`${w}: none`); continue; }
    out.push(`${w}: ${r.verdict} | ${r.because} | need ${r.needCount} capable ${r.needCapable.join(',')} target ${r.target}`);
    out.push(`  days ${r.days.map((d) => `${d.day}:L${d.live.length}N${d.need.length}D${d.dead.length}`).join(' ')}`);
    out.push(`  holds ${r.holds.map((h) => `${h.profileId}=${h.share === undefined ? '-' : h.share.toFixed(3)}`).join(' ')}`);
    out.push(`  answers ${r.answers.slice(0, 6).map((a) => `${a.answer}=${a.share.toFixed(2)}`).join(' ')}`);
    out.push(`  keep ${r.keep.map((k) => `${k.profileId} ${k.saved}/${k.of} ${k.share.toFixed(3)}`).join(' ')}`);
  }
  writeFileSync(process.env['EVAL_OUT']!, out.join('\n'));
});
