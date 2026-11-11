import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDispatcherProfiles, type DispatcherProfile } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { FAMILY_ORDER } from '../dev/familyControls.js';

import { JOURNEY_STAGES, STAGE_FAMILIES, journeyOf } from './workshopJourney.js';

const FILE = parseDispatcherProfiles(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../data/dispatcher-profiles.json', import.meta.url)),
      'utf8',
    ),
  ),
);
const profileOf = (id: string): DispatcherProfile => {
  const found = FILE.profiles.find((profile) => profile.id === id);
  if (found === undefined) throw new Error(`data/ lost ${id}`);
  return found;
};
const sentenceOf = (profile: DispatcherProfile, stage: (typeof JOURNEY_STAGES)[number]): string =>
  journeyOf(profile).find((card) => card.stage === stage)?.readback ?? '';

describe('every control family has a card', () => {
  it('partitions the Engineer editor’s families: each in exactly one stage, none left undrawn', () => {
    // A family added to `dev/familyControls.ts` that no card claims fails here, by name — which is
    // the *carried, and not drawn here* list refusing to come back.
    const drawn = JOURNEY_STAGES.flatMap((stage) => STAGE_FAMILIES[stage]);
    expect([...drawn].sort()).toEqual([...FAMILY_ORDER].sort());
    expect(new Set(drawn).size).toBe(drawn.length);
  });
});

describe('each card reads the dispatcher back as it would run', () => {
  it('draws eight cards for every shipped profile, each with a sentence and no engine id', () => {
    const ids = [
      'up-down-buttons', 'mobile-credential', 'destination-entry', 'split-demand', 'until-commitment',
      'on-deceleration', 'on-door-open', 'zone-center', 'predicted-demand', 'contract-net',
    ];
    for (const profile of FILE.profiles) {
      const cards = journeyOf(profile);
      expect(cards.map((card) => card.stage)).toEqual([...JOURNEY_STAGES]);
      expect(cards.map((card) => card.mark)).toEqual(['1', '2', '3', '4', '5', '6', '7', '∞']);
      for (const card of cards) {
        expect(card.readback.length, `${profile.id} / ${card.stage}`).toBeGreaterThan(10);
        // § 16 rule 11: a sentence is in a player's words, never the engine's.
        for (const id of ids) expect(card.readback).not.toContain(id);
        expect(card.readback).not.toContain(profile.id);
      }
    }
  });

  it('says what distinguishes the shipped designs from one another', () => {
    expect(sentenceOf(profileOf('eta'), 'calling')).toContain('press up or down');
    expect(sentenceOf(profileOf('destination-eta'), 'calling')).toContain('Any car that opens');
    expect(sentenceOf(profileOf('destination-panel'), 'calling')).toContain('a panel at the landing');
    expect(sentenceOf(profileOf('collective'), 'eligible')).toContain('turn round');
    expect(sentenceOf(profileOf('collective-enroute'), 'eligible')).toContain('on its way past');
    expect(sentenceOf(profileOf('nearest-car'), 'priorities')).toMatch(/^It weighs one thing/);
    expect(sentenceOf(profileOf('predictive-balanced'), 'priorities')).toContain('7 more after them');
    expect(sentenceOf(profileOf('predictive-balanced'), 'deciding')).toContain('holds a call for 1.5 s');
    expect(sentenceOf(profileOf('capacity-aware'), 'deciding')).toContain('12 or more waiting');
    expect(sentenceOf(profileOf('auction'), 'deciding')).toContain('one sealed round');
    expect(sentenceOf(profileOf('auction-multi-round'), 'deciding')).toContain('over 3 rounds');
    expect(sentenceOf(profileOf('eta'), 'rethinking')).toBe('Once a call has a car, it keeps that car.');
    expect(sentenceOf(profileOf('fairness-first'), 'rethinking')).toContain('until the doors open, at most 4 times');
    expect(sentenceOf(profileOf('predictive-balanced'), 'landing')).toContain('80 % full');
    expect(sentenceOf(profileOf('energy-aware'), 'landing')).toContain('up to 10 s');
    expect(sentenceOf(profileOf('eta'), 'idle')).toContain('stays where it last stopped');
    expect(sentenceOf(profileOf('zoned-uppeak'), 'idle')).toContain('its own part of the tower');
    expect(sentenceOf(profileOf('predictive-balanced'), 'idle')).toContain('next crowd is expected');
    expect(sentenceOf(profileOf('eta'), 'day')).toContain('One setting, all day');
  });

  it('follows a setting a default would otherwise hide', () => {
    const base = profileOf('eta');
    expect(sentenceOf({ ...base, idle: { parkingStrategy: 'lobby' } }, 'idle')).toContain('waits at the lobby');
    expect(sentenceOf({ ...base, selection: { policy: 'fuzzy' } }, 'day')).toContain('watches the traffic');
    expect(
      sentenceOf(
        { ...base, selection: { policy: 'rules' }, rules: { rows: [{ when: 'shaft-out', then: 'nearest-car' }] } },
        'day',
      ),
    ).toContain('one rule of yours');
  });

  it('says so in plain words when the settings cannot run, and never in the engine’s', () => {
    const cards = journeyOf({ ...profileOf('eta'), engine: 'no-such-engine' });
    for (const card of cards) {
      expect(card.readback).toContain('cannot run together');
      expect(card.readback).not.toContain('no-such-engine');
    }
  });
});
