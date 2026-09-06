/**
 * § 7.5's dock, as words — GitHub issue #171, § D507. The states the corpus drives, asserted for
 * what they say: the figures are the economy's, the incident is live only once it is true of the
 * run, every refusal is a sentence, and nothing speaks in the first person.
 */

import { describe, expect, it } from 'vitest';

import { freshTower } from '../campaign/career.js';
import { purseOf } from '../campaign/economy.js';
import { TECHNICIAN_UNITS, campaignIncidentOf } from '../campaign/incidents.js';
import { RESOURCES } from '../scope/probes.test-helper.js';
import { SHIFT_EVENTS } from '../shift/events.js';

import { CAMPAIGN_DOCK_COPY, campaignDockStrings, campaignDockViewOf, purseRefusalOf } from './campaignDock.js';

const GARDEN = RESOURCES.buildings.find((building) => building.id === 'garden-apartments')!;
const TOWER = freshTower({ contractId: 'c1', buildingId: 'garden-apartments', dispatcherId: 'collective', rate: 3 });
const BREAKDOWN = campaignIncidentOf({ event: SHIFT_EVENTS.breakdown, building: GARDEN, runLengthS: 3600, heldCars: [] })!;

function view(overrides: Partial<Parameters<typeof campaignDockViewOf>[0]> = {}) {
  return campaignDockViewOf({
    tower: TOWER,
    buildingName: 'Garden Apartments',
    incident: BREAKDOWN,
    runLengthS: 3600,
    simTimeS: BREAKDOWN.atS,
    answeredStamp: undefined,
    hasRun: true,
    ...overrides,
  });
}

describe('the three figures', () => {
  it('reads the purse the desk reads, the day’s rate, and what today’s answers cost', () => {
    const figures = view().figures;
    expect(figures.map((figure) => figure.label)).toEqual([
      CAMPAIGN_DOCK_COPY.onHand,
      CAMPAIGN_DOCK_COPY.ifTodayClears,
      CAMPAIGN_DOCK_COPY.spentToday,
    ]);
    expect(figures[0]?.value).toBe(`${String(purseOf(TOWER))} u`);
    expect(figures[2]?.value).toBe('0 u');
    const spent = view({ tower: { ...TOWER, spends: [{ day: 1, units: 3, label: 'x' }] } });
    expect(spent.figures[2]?.value).toBe('3 u');
    expect(spent.figures[0]?.value).toBe(`${String(purseOf(TOWER) - 3)} u`);
  });

  it('names the building and the contract day', () => {
    expect(view().buildingName).toBe('Garden Apartments');
    expect(view().dayLine).toBe('day 1 of 20');
  });
});

describe('the incident block', () => {
  it('is quiet before the car has gone, and on a day nothing is happening', () => {
    expect(view({ simTimeS: BREAKDOWN.atS - 1 }).incident.kind).toBe('quiet');
    expect(view({ incident: undefined }).incident.kind).toBe('quiet');
    expect(view({ incident: undefined }).incident.heading).toBe(CAMPAIGN_DOCK_COPY.quietHeading);
  });

  it('opens on the clock it became true, with the options worded and the footer verbatim', () => {
    const block = view().incident;
    if (block.kind !== 'open') throw new Error('open');
    expect(block.heading).toBe('HAPPENING NOW');
    expect(block.clock).toMatch(/^\d{2}:\d{2}$/u);
    expect(block.title).toBe(BREAKDOWN.title);
    expect(block.options.map((option) => option.id)).toEqual(['technician', 'leave']);
    expect(block.options[0]?.cost).toBe(`${String(TECHNICIAN_UNITS)} u`);
    expect(block.options[1]?.cost).toBe('free');
    expect(block.options.every((option) => option.refusal === undefined)).toBe(true);
    expect(block.footer).toBe('Choose whenever you like — nothing changes until you do, and the day carries on without an answer.');
  });

  it('dims the row the purse cannot cover, and says what it is short by', () => {
    const broke = view({ tower: { ...TOWER, carry: 1 } });
    if (broke.incident.kind !== 'open') throw new Error('open');
    expect(broke.incident.options[0]?.cost).toBe(`${String(TECHNICIAN_UNITS)} u · need ${String(TECHNICIAN_UNITS - 1)} more`);
    expect(broke.incident.options[0]?.refusal).toBe(purseRefusalOf(TECHNICIAN_UNITS));
    expect(broke.incident.options[1]?.refusal).toBeUndefined();
  });

  it('refuses a return the day would end before, and every row without a run', () => {
    const late = view({ simTimeS: 3599 });
    if (late.incident.kind !== 'open') throw new Error('open');
    expect(late.incident.options[0]?.refusal).toContain('the day ends before');
    expect(late.incident.options[1]?.refusal).toBeUndefined();
    const idle = view({ hasRun: false });
    if (idle.incident.kind !== 'open') throw new Error('open');
    expect(idle.incident.options.every((option) => option.refusal !== undefined)).toBe(true);
  });

  it('shows the stamp and the second footer once the log carries an answer', () => {
    const answered = view({ answeredStamp: '09:14 · answered the incident — Call the technician out now' });
    if (answered.incident.kind !== 'answered') throw new Error('answered');
    expect(answered.incident.stamp).toContain('answered the incident');
    expect(answered.incident.footer).toBe('Maintenance is on it. Anything temporary reverts on its own when this closes.');
  });
});

describe('the words', () => {
  it('never speak in the first person, in any state', () => {
    for (const state of [
      view(),
      view({ simTimeS: 0 }),
      view({ incident: undefined }),
      view({ tower: { ...TOWER, carry: 1 } }),
      view({ simTimeS: 3599 }),
      view({ hasRun: false }),
      view({ answeredStamp: '09:14 · answered the incident — x' }),
    ]) {
      for (const text of campaignDockStrings(state)) expect(text).not.toMatch(/\b(I|me|my|we|our)\b/u);
    }
  });

  it('draws the parking and the handover as the arms under the stage, never as options', () => {
    const block = view().incident;
    if (block.kind !== 'open') throw new Error('open');
    expect(block.options.map((option) => option.label).join(' ')).not.toMatch(/park|hand the day|switch/iu);
    expect(view().otherLevers).toBe(CAMPAIGN_DOCK_COPY.otherLevers);
  });
});
