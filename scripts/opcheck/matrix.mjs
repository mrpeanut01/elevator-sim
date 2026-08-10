/**
 * Build the cell matrix for opcheck and write it as JSON, sliced for parallel workers.
 *
 * Usage: node matrix.mjs <outDir> [--slices N] [--set core|templates|traffic|stress|all]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@elevator-sim/core';

const DATA_DIR = process.env['ELEVATOR_SIM_DATA'] ?? fileURLToPath(new URL('../../data', import.meta.url));

const args = process.argv.slice(2);
const outDir = args[0] ?? 'out';
const slices = Number(args.includes('--slices') ? args[args.indexOf('--slices') + 1] : 8);
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'core';

const cfg = await loadConfig(DATA_DIR);
const buildings = cfg.buildings.map((b) => b.id);
const dispatchers = [...cfg.dispatcherProfilesById.keys()];
const traffic = [...cfg.trafficProfilesById.keys()];
const templates = ['rise-and-fall', 'constant-iso', 'lunch-two-way', 'shift-change', 'evening-egress', 'office-down-peak'];

const SEED = 20260810;
const cells = [];

const push = (c) => cells.push(c);

if (set === 'core' || set === 'all') {
  // Every dispatcher × every building, on the building's own traffic, three seeds.
  for (const building of buildings)
    for (const dispatcher of dispatchers)
      for (const seed of [SEED, SEED + 1, SEED + 2])
        push({ building, dispatcher, seed, template: 'rise-and-fall', group: 'core' });
}

if (set === 'templates' || set === 'all') {
  // Every dispatcher × every building × every demand template. This is where up-peak,
  // down-peak, two-way and shift-change gameplay live.
  for (const building of buildings)
    for (const dispatcher of dispatchers)
      for (const template of templates.filter((t) => t !== 'rise-and-fall'))
        push({ building, dispatcher, seed: SEED, template, group: 'templates' });
}

if (set === 'traffic' || set === 'all') {
  // Every dispatcher × every building × every traffic profile override — the UI will let
  // players put hotel demand in an office and so on.
  for (const building of buildings)
    for (const dispatcher of dispatchers)
      for (const t of traffic)
        push({ building, dispatcher, traffic: t, seed: SEED, template: 'rise-and-fall', group: 'traffic' });
}

if (set === 'stress' || set === 'all') {
  // Failure modes and simulation tweaks the new UI is said to add.
  for (const building of buildings)
    for (const dispatcher of dispatchers) {
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'stress',
             label: `${building}/${dispatcher}/patience`, patience: { meanS: 120, distribution: 'exponential' } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'stress',
             label: `${building}/${dispatcher}/obstruction`, doorObstructionProbability: 0.05 });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'stress',
             label: `${building}/${dispatcher}/heavy`, demand: { arrivalRatePctPop5min: 18 } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'stress',
             label: `${building}/${dispatcher}/light`, demand: { arrivalRatePctPop5min: 2 } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'stress',
             label: `${building}/${dispatcher}/down`, demand: { directionalSplit: { incoming: 0.1, outgoing: 0.8, interfloor: 0.1 } } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'stress',
             label: `${building}/${dispatcher}/interfloor`, demand: { directionalSplit: { incoming: 0.1, outgoing: 0.1, interfloor: 0.8 } } });
      // Failure modes: cars withdrawn mid-run, and withdrawn-then-restored.
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'failure',
             label: `${building}/${dispatcher}/withdraw-1`, serviceEvents: { withdraw: 1, atS: 300 } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'failure',
             label: `${building}/${dispatcher}/withdraw-half`, serviceEvents: { withdraw: 2, atS: 300 } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'failure',
             label: `${building}/${dispatcher}/withdraw-restore`, serviceEvents: { withdraw: 2, atS: 300, restoreAtS: 900 } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'failure',
             label: `${building}/${dispatcher}/fire-recall`, serviceEvents: { withdraw: 1, atS: 400, mode: 'fire-recall' } });
      push({ building, dispatcher, seed: SEED, template: 'rise-and-fall', group: 'failure',
             label: `${building}/${dispatcher}/independent`, serviceEvents: { withdraw: 1, atS: 400, mode: 'independent' } });
    }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/all.json`, JSON.stringify(cells, null, 0));
const per = Math.ceil(cells.length / slices);
for (let i = 0; i < slices; i += 1) {
  writeFileSync(`${outDir}/slice-${i}.json`, JSON.stringify(cells.slice(i * per, (i + 1) * per), null, 0));
}
process.stdout.write(`${cells.length} cells (${set}) → ${slices} slices of ≤${per} in ${outDir}\n`);
process.stdout.write(`buildings=${buildings.length} dispatchers=${dispatchers.length} traffic=${traffic.length} templates=${templates.length}\n`);
