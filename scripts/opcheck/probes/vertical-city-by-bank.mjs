/** Where do vertical-city/destination-panel's broken promises land — which bank, which floors? */
import { loadConfig, runSimulation } from '@elevator-sim/core';
const cfg = await loadConfig(new URL('../../../data', import.meta.url).pathname);
const b = cfg.buildingsById.get('vertical-city');
const r = runSimulation({
  building: b, dispatcherProfile: cfg.dispatcherProfilesById.get('destination-panel'),
  trafficProfiles: cfg.trafficProfiles, dispatcherProfiles: cfg.dispatcherProfiles,
  elevatorSpecs: cfg.elevatorSpecs, seed: 20270000, demandTemplate: 'rise-and-fall', onTimeout: 'report',
});
const sa = r.stageActivity;
console.log('stageActivity deck counters:');
for (const k of Object.keys(sa)) if (/[Dd]eck/.test(k)) console.log('  ', k, JSON.stringify(sa[k]));
console.log('\nconservation:', JSON.stringify({
  generated: r.conservation.generated, delivered: r.conservation.delivered,
  undelivered: r.conservation.undelivered, legsAssigned: r.conservation.legsAssigned,
  brokenPromises: r.conservation.brokenPromises, promisesRevoked: r.conservation.promisesRevoked,
  wrongCarBoardings: r.conservation.wrongCarBoardings,
}));

// Waits by bank, on legs that were assigned a car.
const byBank = new Map();
for (const l of r.record.passengers) {
  const bank = l.bankId ?? '(never boarded)';
  if (!byBank.has(bank)) byBank.set(bank, { legs: 0, boarded: 0, waits: [] });
  const e = byBank.get(bank); e.legs += 1;
  if (l.boardedAt !== undefined) { e.boarded += 1; e.waits.push(l.boardedAt - l.arrivedAt); }
}
console.log('\nper-bank service:');
for (const [bank, e] of byBank) {
  e.waits.sort((x, y) => x - y);
  const p = (q) => e.waits.length ? e.waits[Math.floor(q * (e.waits.length - 1))].toFixed(0) : '—';
  console.log('  ', bank.padEnd(16), 'legs', String(e.legs).padStart(5), 'boarded', String(e.boarded).padStart(5),
              'wait p50', String(p(0.5)).padStart(5), 'p95', String(p(0.95)).padStart(6), 'max', String(p(1)).padStart(6));
}

// Undelivered: where were they standing?
const floors = new Map();
for (const u of r.undelivered) floors.set(u.originFloorId, (floors.get(u.originFloorId) ?? 0) + 1);
console.log('\nundelivered by origin floor:', [...floors].sort((a,c)=>c[1]-a[1]).slice(0,15).map(([f,n])=>f+'×'+n).join(' '));
console.log('undelivered by reason:', JSON.stringify(r.undelivered.reduce((a,u)=>(a[u.reason]=(a[u.reason]??0)+1,a),{})));
