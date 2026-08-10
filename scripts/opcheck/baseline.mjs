/**
 * Pin, and later re-check, the operating behaviour of every dispatcher in every building.
 *
 * The point is regression detection across a change that is *supposed* to change other things.
 * The new UI will add building types, failure modes and gameplay; it must not silently change how
 * an existing lift group operates. So this records, per (building × dispatcher × seed), the facts
 * that describe *operation* — who boarded, which car, which bank, how far each car drove — and
 * nothing that describes *quality*. A dispatcher that gets faster is not a regression. A dispatcher
 * whose bank suddenly serves nobody is.
 *
 *   node baseline.mjs write  baseline.json     # pin the current tree
 *   node baseline.mjs check  baseline.json     # compare the current tree against the pin
 *
 * `check` exits 1 on any difference and prints what moved. A difference is not automatically a
 * bug — but it is automatically something a human has to have decided to do.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { checkCell, config } from './opcheck.mjs';

const SEEDS = [20260810, 20260811, 20260812];
const TEMPLATE = 'rise-and-fall';

/** Operation, not quality. Rounded, because floating-point noise is not a regression. */
function fingerprint(facts) {
  const r2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : n);
  return {
    status: facts.status,
    generated: facts.generated,
    delivered: facts.delivered,
    undelivered: facts.undelivered,
    legsCreated: facts.legsCreated,
    legsBoarded: facts.legsBoarded,
    legsAlighted: facts.legsAlighted,
    transfers: facts.transfers,
    transportHops: facts.transportHops,
    stairsJourneys: facts.stairsJourneys,
    accessRefused: facts.accessRefused,
    abandoned: facts.abandoned,
    perBankServed: facts.perBankServed,
    perCarCarried: facts.perCarCarried,
    perCarDistanceM: Object.fromEntries(Object.entries(facts.perCarDistanceM).map(([k, v]) => [k, r2(v)])),
    maxServedWaitS: r2(facts.maxServedWaitS),
    endedAtS: r2(facts.endedAtS),
    events: facts.events,
    stageActivity: facts.stageActivity,
  };
}

const mode = process.argv[2];
const file = process.argv[3] ?? 'scripts/opcheck/baseline.json';
if (mode !== 'write' && mode !== 'check') {
  process.stderr.write('usage: node baseline.mjs write|check [file]\n');
  process.exit(2);
}

const cfg = await config();
const buildings = cfg.buildings.map((b) => b.id);
const dispatchers = [...cfg.dispatcherProfilesById.keys()];

const current = {};
for (const building of buildings) {
  for (const dispatcher of dispatchers) {
    for (const seed of SEEDS) {
      const key = `${building}|${dispatcher}|${seed}`;
      const r = await checkCell({ building, dispatcher, seed, template: TEMPLATE });
      current[key] = {
        ...fingerprint(r.facts),
        findings: r.findings.map((f) => f.code).sort(),
      };
    }
  }
  process.stderr.write(`${building} `);
}
process.stderr.write('\n');

if (mode === 'write') {
  writeFileSync(file, JSON.stringify({ pinnedAt: 'unpinned — set by the committer', template: TEMPLATE, seeds: SEEDS, cells: current }, null, 1));
  process.stdout.write(`pinned ${Object.keys(current).length} cells to ${file}\n`);
  process.exit(0);
}

const pinned = JSON.parse(readFileSync(file, 'utf8')).cells;
let moved = 0;
const keys = new Set([...Object.keys(pinned), ...Object.keys(current)]);
for (const key of [...keys].sort()) {
  const a = pinned[key];
  const b = current[key];
  if (!a) { process.stdout.write(`NEW  ${key}\n`); moved += 1; continue; }
  if (!b) { process.stdout.write(`GONE ${key}\n`); moved += 1; continue; }
  const diffs = [];
  for (const k of Object.keys(a)) {
    const [x, y] = [JSON.stringify(a[k]), JSON.stringify(b[k])];
    if (x !== y) diffs.push(`${k}: ${x} → ${y}`);
  }
  if (diffs.length) {
    moved += 1;
    process.stdout.write(`DIFF ${key}\n`);
    for (const d of diffs.slice(0, 8)) process.stdout.write(`       ${d}\n`);
    if (diffs.length > 8) process.stdout.write(`       … and ${diffs.length - 8} more fields\n`);
  }
}
process.stdout.write(`\n${keys.size} cells · ${moved} moved · ${keys.size - moved} unchanged\n`);
process.exit(moved > 0 ? 1 : 0);
