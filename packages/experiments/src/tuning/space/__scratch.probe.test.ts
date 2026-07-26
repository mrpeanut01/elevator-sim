import { writeFileSync } from 'node:fs';
import { describe, it, beforeAll } from 'vitest';
import { loadConfig, runSimulation } from '@elevator-sim/core';
import type { LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { searchSpace, defaultCandidate, candidateFromProfile } from './collect.js';
import { buildingFeasibility, candidateProfile, vectorDimensions, fromVector, toVector } from './encode.js';
import { policyNoiseStream } from './sample.js';
import type { Candidate } from './types.js';

const SPACE = searchSpace();
const out: string[] = [];
const log = (...a: unknown[]) => out.push(a.map(String).join(' '));
const DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));
let CONFIG: LoadedConfig;
beforeAll(async () => { CONFIG = await loadConfig(DATA_DIR); });

describe('endpoints', () => {
  it('every numeric endpoint', () => {
    const bld = CONFIG.buildingsById.get('garden-apartments')!;
    const feasible = buildingFeasibility(SPACE, bld, CONFIG.elevatorSpecs);
    for (const p of SPACE.parameters) {
      if (p.type !== 'continuous' && p.type !== 'integer') continue;
      for (const [label, v] of [['min', p.min], ['max', p.max]] as const) {
        const point = new Map(defaultCandidate(SPACE));
        // force the gate on so the dimension is live
        if (p.id.startsWith('idle.reposition')) point.set('idle.parkingStrategy', 'lobby');
        if (p.id === 'answer.maxDwellS' || p.id === 'answer.dwellAdaptationGain') point.set('answer.dwellPolicy', 'adaptive');
        if (p.id.startsWith('auction.')) { point.set('auction.aggregation', 'contract-net'); point.set('auction.rounds', 3); }
        if (p.id === 'dispatch.deferWindowS') point.set('dispatch.assignmentTiming', 'deferred');
        if (p.id === 'dispatch.splitThresholdPassengers') point.set('dispatch.assignmentMode', 'split-demand');
        if (p.id.startsWith('dispatch.reassignment') || p.id === 'dispatch.maxReassignmentsPerCall') point.set('dispatch.reassignmentPolicy', 'continuous');
        point.set(p.id, v);
        const spaceSays = SPACE.validate(point);
        const bldSays = spaceSays === undefined ? feasible(point) : undefined;
        let ranOk = 'skipped';
        if (spaceSays === undefined && bldSays === undefined) {
          try {
            const prof = candidateProfile(SPACE, point, { id: 'probe-arm' });
            const r = runSimulation({ building: bld, dispatcherProfile: prof,
              trafficProfiles: CONFIG.trafficProfiles, elevatorSpecs: CONFIG.elevatorSpecs,
              seed: 7, durationS: 120 });
            ranOk = 'ran(arrivals=' + r.summary.counts.arrivals + ')';
          } catch (e) { ranOk = 'RUN THREW: ' + (e as Error).message.slice(0,110); }
        }
        if (spaceSays !== undefined) log('ENDPOINT', p.id, label, v, '-> space.validate REJECTS:', spaceSays.slice(0,90));
        else if (bldSays !== undefined) log('ENDPOINT', p.id, label, v, '-> buildingFeasibility REJECTS:', bldSays.slice(0,90));
        else if (ranOk.startsWith('RUN THREW')) log('ENDPOINT', p.id, label, v, '->', ranOk);
      }
    }
    log('--- endpoint scan done ---');
  }, 300000);

  it('writes', () => { writeFileSync(process.env['PROBE_OUT'] as string, out.join('\n')); });
});
