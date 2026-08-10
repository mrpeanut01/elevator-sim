/**
 * Aggregate opcheck NDJSON into a triage report.
 *
 * Usage: node report.mjs <glob-dir> [--code CODE] [--group G] [--json]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dir = args[0];
const only = args.includes('--code') ? args[args.indexOf('--code') + 1] : undefined;
const onlyGroup = args.includes('--group') ? args[args.indexOf('--group') + 1] : undefined;
const asJson = args.includes('--json');

const rows = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.ndjson'))) {
  for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
}

const byCode = new Map();
for (const r of rows) {
  if (onlyGroup && r.cell.group !== onlyGroup) continue;
  for (const fi of r.findings) {
    if (only && fi.code !== only) continue;
    if (!byCode.has(fi.code)) byCode.set(fi.code, { code: fi.code, severity: fi.severity, hits: [] });
    byCode.get(fi.code).hits.push({ label: r.cell.label, group: r.cell.group, building: r.cell.building, dispatcher: r.cell.dispatcher, traffic: r.cell.traffic, template: r.cell.template, seed: r.cell.seed, message: fi.message, detail: fi.detail });
  }
}

const order = { error: 0, warn: 1, info: 2 };
const codes = [...byCode.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.hits.length - a.hits.length);

if (asJson) {
  process.stdout.write(JSON.stringify({ total: rows.length, codes }, null, 2));
} else {
  const errored = rows.filter((r) => !r.ok).length;
  process.stdout.write(`${rows.length} cells · ${errored} with at least one error · ${rows.length - errored} clean\n\n`);
  for (const c of codes) {
    process.stdout.write(`[${c.severity}] ${c.code} — ${c.hits.length} cell(s)\n`);
    // Which buildings/dispatchers/groups does it concentrate in?
    const tally = (k) => {
      const m = new Map();
      for (const h of c.hits) m.set(h[k] ?? '—', (m.get(h[k] ?? '—') ?? 0) + 1);
      return [...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join(' ');
    };
    process.stdout.write(`   buildings:   ${tally('building')}\n`);
    process.stdout.write(`   dispatchers: ${tally('dispatcher')}\n`);
    process.stdout.write(`   groups:      ${tally('group')}\n`);
    if (only) for (const h of c.hits) process.stdout.write(`   · ${h.label}: ${h.message}\n`);
    else process.stdout.write(`   e.g. ${c.hits[0].label}: ${c.hits[0].message}\n`);
    process.stdout.write('\n');
  }
}
