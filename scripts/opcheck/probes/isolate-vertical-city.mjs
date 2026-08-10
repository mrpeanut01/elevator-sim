/**
 * Is vertical-city/destination-panel's failure about the DOUBLE-DECK shuttles, the sky-lobby
 * TRANSFER chain, or the panel itself? Vary one structural thing at a time on the same trace.
 */
import { loadConfig, runSimulation } from '@elevator-sim/core';
const cfg = await loadConfig(new URL('../../../data', import.meta.url).pathname);
const base = cfg.buildingsById.get('vertical-city');

const variant = (name, mutate) => ({ name, building: mutate(structuredClone({
  ...base,
  floorsById: undefined, floorsByIndex: undefined,   // Maps don't structuredClone into the shape we need
})) });

// Rebuild the maps after cloning.
const rehydrate = (b) => ({
  ...b,
  floorsById: new Map(b.floors.map((f) => [f.id, f])),
  floorsByIndex: new Map(b.floors.map((f) => [f.index, f])),
});

const variants = [
  ['as shipped', (b) => b],
  ['shuttles single-deck', (b) => ({ ...b, banks: b.banks.map((k) => k.id !== 'shuttle' ? k : ({ ...k, servesFloorPairs: undefined, cars: k.cars.map((c) => ({ ...c, doubleDeck: false, deckSeparationM: undefined })) })) })],
  ['no escalators', (b) => ({ ...b, transportModes: [] })],
  ['no access zones', (b) => ({ ...b, accessZones: [] })],
];

for (const dispatcherId of ['destination-panel', 'collective']) {
  for (const [name, mutate] of variants) {
    const b = rehydrate(mutate(rehydrate(structuredClone({ ...base, floorsById: undefined, floorsByIndex: undefined }))));
    let r;
    try {
      r = runSimulation({
        building: b, dispatcherProfile: cfg.dispatcherProfilesById.get(dispatcherId),
        trafficProfiles: cfg.trafficProfiles, dispatcherProfiles: cfg.dispatcherProfiles,
        elevatorSpecs: cfg.elevatorSpecs, seed: 20270000, demandTemplate: 'rise-and-fall',
        onTimeout: 'report',
      });
    } catch (e) { console.log(`${dispatcherId.padEnd(18)} ${name.padEnd(22)} THREW ${e.message.slice(0, 90)}`); continue; }
    const c = r.conservation;
    console.log(`${dispatcherId.padEnd(18)} ${name.padEnd(22)} ${r.status.padEnd(10)} gen ${String(c.generated).padStart(5)} deliv ${String(c.delivered).padStart(5)} undeliv ${String(c.undelivered).padStart(4)} broken ${String(c.brokenPromises).padStart(6)} hops ${String(c.transportHops).padStart(4)} deckStops ${r.stageActivity.doubleDeckStops}`);
  }
}
