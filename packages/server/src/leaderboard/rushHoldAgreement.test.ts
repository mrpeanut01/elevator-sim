/// <reference types="node" />

/**
 * **The server's replay and a player's rush meet the same crowd** — the server's half of the
 * agreement PR #513's review asked for (finding 1), on every shipped building.
 *
 * ## Why a table both halves pin, rather than one test that runs both
 *
 * The two paths live in packages that may not import each other: this one may not import `viz`
 * (§ D214 § 3), and `viz` must build with this package absent (`menu/challenge.ts` says why). So
 * the agreement is carried by one table, `rushHoldAgreement.json`, and **each half pins its own
 * path to it**: this file replays every cell through `verify.ts#rushRoundConfigFor` — the one way
 * `rushSitting.ts#replayRushSitting` builds a round — and `packages/viz/src/everyday/
 * rushHoldAgreement.test.ts` plays the same cell through `EverydayHost.startRush`, the path a
 * player's press takes, and reads the stage's own hold line. Neither half can move without going
 * red against a table the other half still pins, which is the agreement, and a figure in the table
 * is never edited by hand: the command in it rewrites it, and a regeneration skips the comparison
 * so it cannot be mistaken for a passing guard (`survivorSweep.test.ts`'s precedent).
 *
 * ## Which cells, and why every building has one that breaks
 *
 * One cell per shipped building at least, and it has to **break**: a cell where both halves hold to
 * the horizon agrees at `null` whatever crowd either ran, so it would be a pin on nothing. Collective
 * breaks everywhere except Vertical City and the Burj-class reference, which are pinned under
 * nearest-car instead. The two towers the review found diverging — Midtown Office and Chancery House
 * — carry a second dispatcher each, and Midtown carries the two logged rounds `rushSitting.test.ts`
 * drives, so the figures that fixture quotes are ones a player's run is pinned to produce.
 *
 * The cheapest cells rather than a sweep: every shipped dispatcher on every building is 117 runs and
 * over two minutes a side, and the always-on tier pays for none of that.
 *
 * ## One cell is a fixture, and it is the one no shipped cell could be — GitHub issue #523, item 2
 *
 * This replay resolves a round's dispatcher id against the server's own `data/` and runs that
 * profile's own `selection`. The viewer's press took the selector from a fresh session instead,
 * which seeds it from the *opening* dispatcher. The two agreed on every shipped cell only because no
 * shipped profile declares a selection, so no shipped cell could tell them apart. A cell carrying
 * `declaredSelection` gives its profile that block in **both** halves before anything is resolved —
 * the day a shipped profile declares one — and the viewer's half fails where its press does not read
 * the selector off the profile it brings. Chancery House under `nearest-car` with a fuzzy selection
 * is the cell because the selection moves the hold there by more than fifteen minutes.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, rushHoldAtLegs, runSimulation, type SimulationConfig } from '@elevator-sim/core';

import type { SubmittedIntervention } from './submission.js';
import { rushRoundConfigFor, type VerificationResources } from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const TABLE_URL = new URL('./rushHoldAgreement.json', import.meta.url);
const REGENERATE = process.env['ELEVATOR_SIM_REGENERATE_RUSH_AGREEMENT'] === '1';

interface AgreementCell {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly interventions?: readonly SubmittedIntervention[];
  /** A `selection` both halves give this cell's profile before resolving it — see the docstring's last section. */
  readonly declaredSelection?: NonNullable<SimulationConfig['dispatcherProfile']['selection']>;
  /** Seconds from the round's start to the line being crossed, or `null` when it never was. */
  readonly heldS: number | null;
}

interface AgreementTable {
  readonly generatedBy: string;
  readonly command: string;
  readonly cells: readonly AgreementCell[];
}

const table = JSON.parse(readFileSync(TABLE_URL, 'utf8')) as AgreementTable;

function labelOf(cell: AgreementCell): string {
  const log = (cell.interventions ?? []).map((entry) =>
    entry.change.kind === 'switch-dispatcher' ? `→${entry.change.toProfileId}@${String(entry.atS)}` : `${entry.change.kind}@${String(entry.atS)}`,
  );
  const declared = cell.declaredSelection === undefined ? [] : [`declaring ${JSON.stringify(cell.declaredSelection)}`];
  return [cell.buildingId, cell.dispatcherProfileId, ...declared, ...log].join(' ');
}

let resources: VerificationResources;
let shippedBuildingIds: readonly string[];
const measured = new Map<string, number | null>();

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  resources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };
  shippedBuildingIds = [...config.buildingsById.keys()];
});

/** The shipped resources, with the cell's profile declaring its fixture selection where it has one. */
function resourcesFor(cell: AgreementCell): VerificationResources {
  const selection = cell.declaredSelection;
  if (selection === undefined) return resources;
  const declaring = (profile: SimulationConfig['dispatcherProfile']): SimulationConfig['dispatcherProfile'] =>
    profile.id === cell.dispatcherProfileId ? { ...profile, selection } : profile;
  return {
    ...resources,
    dispatcherProfilesById: new Map([...resources.dispatcherProfilesById].map(([id, profile]) => [id, declaring(profile)] as const)),
    // `verify.ts#configOver`'s own guard: the file is optional on a verification's resources.
    ...(resources.dispatcherProfiles === undefined
      ? {}
      : { dispatcherProfiles: { ...resources.dispatcherProfiles, profiles: resources.dispatcherProfiles.profiles.map(declaring) } }),
  };
}

afterAll(() => {
  if (!REGENERATE || measured.size !== table.cells.length) return;
  const cells = table.cells.map((cell) => ({ ...cell, heldS: measured.get(labelOf(cell)) ?? null }));
  const lines = cells.map((cell) => `    ${JSON.stringify(cell)}`);
  const head = JSON.stringify({ generatedBy: table.generatedBy, command: table.command }, null, 2).replace(/\n\}$/u, '');
  writeFileSync(TABLE_URL, `${head},\n  "cells": [\n${lines.join(',\n')}\n  ]\n}\n`);
});

describe('the rush hold agreement table — the server’s replay half (PR #513, finding 1)', () => {
  it('covers every shipped building, each with a cell that breaks, so no building agrees only at null', () => {
    const covered = new Set(table.cells.map((cell) => cell.buildingId));
    expect([...covered].sort()).toEqual([...shippedBuildingIds].sort());
    if (REGENERATE) return;
    const breaking = new Set(table.cells.filter((cell) => cell.heldS !== null).map((cell) => cell.buildingId));
    expect([...breaking].sort()).toEqual([...shippedBuildingIds].sort());
  });

  it.each(table.cells.map((cell) => [labelOf(cell), cell] as const))('%s', (label, cell) => {
    const config = rushRoundConfigFor(
      cell.buildingId,
      { dispatcherProfileId: cell.dispatcherProfileId, ...(cell.interventions === undefined ? {} : { interventions: cell.interventions }) },
      resourcesFor(cell),
    );
    if (typeof config === 'string') throw new Error(`${label} does not resolve on this server: ${config}`);
    const { record } = runSimulation(config);
    // A cell's `atS` is simulated seconds from the round's start, which is only true if the round
    // starts at zero — the window `rushRoundConfigFor` sets. Asserted so a moved start cannot shift
    // every logged cell silently.
    expect(record.startedAt).toBe(0);
    const hold = rushHoldAtLegs(record.passengers, record.startedAt, record.endedAt);
    const heldS = hold === undefined ? null : hold - record.startedAt;
    measured.set(label, heldS);
    if (REGENERATE) return;
    expect(heldS, `${label}: the server's replay no longer holds where the table says`).toBe(cell.heldS);
  });
});
