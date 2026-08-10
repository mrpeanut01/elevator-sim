/**
 * Negative control for `double-deck-pairing-incomplete`: cut vertical-city's shuttle down to a
 * single declared floor pair and require the check to notice that most deck stops now open one
 * deck. The shipped building must stay silent.
 */
import { loadConfig, runSimulation } from '@elevator-sim/core';
const cfg = await loadConfig(new URL('../../../data', import.meta.url).pathname);
const base = cfg.buildingsById.get('vertical-city');
const rehydrate = (b) => ({ ...b, floorsById: new Map(b.floors.map((f) => [f.id, f])), floorsByIndex: new Map(b.floors.map((f) => [f.index, f])) });
const clone = () => rehydrate(structuredClone({ ...base, floorsById: undefined, floorsByIndex: undefined }));

for (const [name, mutate] of [
  ['as shipped', (b) => b],
  ['only [G,2] paired', (b) => ({ ...b, banks: b.banks.map((k) => k.id !== 'shuttle' ? k : ({ ...k, servesFloorPairs: [['G', '2']] })) })],
]) {
  const b = rehydrate(mutate(clone()));
  const r = runSimulation({
    building: b, dispatcherProfile: cfg.dispatcherProfilesById.get('eta'),
    trafficProfiles: cfg.trafficProfiles, dispatcherProfiles: cfg.dispatcherProfiles,
    elevatorSpecs: cfg.elevatorSpecs, seed: 20270000, demandTemplate: 'rise-and-fall', onTimeout: 'report',
  });
  const s = r.stageActivity;
  console.log(name.padEnd(20), 'stops', String(s.doubleDeckStops).padStart(4), 'paired', String(s.doubleDeckPairedStops).padStart(4),
              'boardings', JSON.stringify(s.doubleDeckBoardings), 'mismatchRefusals', s.deckMismatchLegs);
}
