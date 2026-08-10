/** Lower/upper deck boardings by sky lobby, at two seeds — the audit cited one, lane 3 another. */
import { loadConfig, runSimulation } from '@elevator-sim/core';
const cfg = await loadConfig(new URL('../../../data', import.meta.url).pathname);
const b = cfg.buildingsById.get('vertical-city');
for (const seed of [20260810, 20270000]) {
  const r = runSimulation({
    building: b, dispatcherProfile: cfg.dispatcherProfilesById.get('eta'),
    trafficProfiles: cfg.trafficProfiles, dispatcherProfiles: cfg.dispatcherProfiles,
    elevatorSpecs: cfg.elevatorSpecs, seed, demandTemplate: 'rise-and-fall', onTimeout: 'report',
  });
  // Shuttle boardings by floor, lower vs upper of each declared pair.
  const pairs = [['G','2'],['26','27'],['51','52'],['76','77']];
  const at = new Map();
  for (const l of r.record.passengers) {
    if (l.bankId !== 'shuttle' || l.boardedAt === undefined) continue;
    at.set(l.originFloorId, (at.get(l.originFloorId) ?? 0) + 1);
  }
  const parts = pairs.map(([lo, hi]) => `${lo}/${hi}: ${at.get(lo) ?? 0}/${at.get(hi) ?? 0}`);
  console.log('seed', seed, '|', parts.join('  '), '| stageActivity boardings', JSON.stringify(r.stageActivity.doubleDeckBoardings));
}
