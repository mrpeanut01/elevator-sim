/**
 * The dashboard command's one branch that does not need a database — GitHub issue #250.
 *
 * `dashboardMain` is three calls to functions with their own tests (`Store.open`,
 * `Store.telemetryEventsForDashboard`, `dashboardOf`/`renderDashboard`) and one decision of its
 * own: what to do when nobody said which database. That decision is here.
 *
 * **Both limbs, and the second is the one that matters.** An unset variable is the obvious case; a
 * variable set to whitespace is the one a `!== undefined` check waves through, and it produces a
 * connection string of `''` — which is how an empty local database gets read as a live one.
 */

import { describe, expect, it } from 'vitest';

import { dashboardMain } from './dashboardMain.js';

describe('the dashboard command refuses to guess its database', () => {
  it('refuses an unset ELEVATOR_SIM_DB and writes nothing', async () => {
    const written: string[] = [];
    await expect(dashboardMain({}, (text) => written.push(text))).rejects.toThrow(
      /ELEVATOR_SIM_DB is not set/u,
    );
    expect(written, 'a command that could not read anything printed a dashboard').toEqual([]);
  });

  it('refuses a blank one, which is the limb an undefined check misses', async () => {
    await expect(dashboardMain({ ELEVATOR_SIM_DB: '   ' }, () => undefined)).rejects.toThrow(
      /deliberately no default/u,
    );
  });
});
