/**
 * **The four outcomes of pressing *Watch it*, driven without a document** — GitHub issue #531
 * item 2, § D567.
 *
 * The press is a three-hazard decision with a worker round trip in the middle of it, and until this
 * file the only thing driving any of it was `everyday/watchStage.browser.test.ts`, on the **week**
 * screen. The board carried a copy of the same decision that nothing drove at all: its rows come
 * from a server, the browser tier stands none up, so reverting the board's guard failed nothing.
 * `watchPress.ts` is that decision with one home; this drives it.
 *
 * ## What the fake host is, and what it deliberately does not do
 *
 * `watchRun`'s contract is *the gate re-simulates, enters the spectator state on an exact
 * reproduction, and settles exactly once*. The fake keeps the settle callback rather than calling
 * it, so a case can land the answer **after** it has done whatever it wants to the screen — which
 * is the whole subject of the third case and is not expressible against a synchronous stand-in.
 * The gate's own verdict is `watch/` 's and is not re-decided here: a case says what the gate
 * answered and asserts what the screen then did.
 */

import { describe, expect, it } from 'vitest';

import type { WatchableRun, WatchBlocked } from '../watch/types.js';

import { pressWatchRow, type WatchPressHost, type WatchPressPorts } from './watchPress.js';

/**
 * A row the gate can answer about.
 *
 * `record: null` and `posted: undefined` rather than a fixture record: this decision reads `id` and
 * `blocked` and nothing else, and a row carrying a record nothing replays would be inviting the next
 * reader to believe the gate here is real. The one that is real is `watch/library.ts`'s.
 */
function row(id: string, blocked: WatchBlocked | null = null): WatchableRun {
  return {
    id,
    source: 'filed-day',
    label: `run ${id}`,
    buildingName: 'Midtown Office',
    subtitle: 'Tuesday · day 2',
    record: null,
    posted: undefined,
    blocked,
  };
}

/** The gate's refusal, by the ground it names rather than by its prose. */
const REFUSED: WatchBlocked = {
  ground: 'does-not-reproduce',
  reason: 'this build replays it differently',
};

interface Screen {
  readonly ports: WatchPressPorts;
  readonly host: WatchPressHost;
  /** Land the gate's answer, as the worker's message would. */
  readonly settle: (checked: WatchableRun) => void;
  readonly calls: string[];
  checking: string | undefined;
  alive: boolean;
  watching: WatchableRun | undefined;
}

function screen(): Screen {
  const calls: string[] = [];
  let settled: ((checked: WatchableRun) => void) | undefined;
  const state: Screen = {
    calls,
    checking: undefined,
    alive: true,
    watching: undefined,
    host: {
      watchRun: (run, done) => {
        calls.push(`watchRun:${run.id}`);
        /*
         * The gate enters the spectator state **before** it answers — `dev/main.ts#enterWatch` runs
         * inside the reproduction's own callback — which is exactly why the late-landing arm has
         * something to undo. A fake that entered nothing would let that arm pass by doing nothing.
         */
        state.watching = run;
        settled = done;
      },
      watching: () => (state.watching === undefined ? undefined : { run: state.watching, view: undefined as never }),
      stopWatching: () => {
        calls.push('stopWatching');
        state.watching = undefined;
      },
    },
    settle: (checked) => {
      const done = settled;
      if (done === undefined) throw new Error('the gate was never asked, so there is nothing to settle');
      settled = undefined;
      done(checked);
    },
    ports: {
      alive: () => state.alive,
      checking: () => state.checking,
      setChecking: (rowId) => {
        calls.push(`checking:${rowId ?? 'none'}`);
        state.checking = rowId;
      },
      redraw: () => {
        calls.push('redraw');
      },
      refuse: (checked) => {
        calls.push(`refuse:${checked.id}`);
      },
      enter: () => {
        calls.push('enter');
      },
    },
  };
  return state;
}

describe('pressing Watch it on a row', () => {
  it('puts the row busy, draws, and asks the gate — in that order', () => {
    const s = screen();
    pressWatchRow(s.host, 'row-1', row('run-1'), s.ports);
    expect(s.calls).toEqual(['checking:row-1', 'redraw', 'watchRun:run-1']);
    /* The busy key is the screen's row id, not the run's — the board's two differ. */
    expect(s.checking).toBe('row-1');
  });

  it('enters the watch when the gate reproduces the run', () => {
    const s = screen();
    const run = row('run-1');
    pressWatchRow(s.host, 'row-1', run, s.ports);
    s.settle(run);
    expect(s.calls.slice(3)).toEqual(['checking:none', 'enter']);
    /* No redraw on this arm: entering navigates, and a draw here would repaint a screen being left. */
    expect(s.checking).toBeUndefined();
  });

  it('records the refusal and draws it, and navigates nowhere, when the gate blocks the row', () => {
    const s = screen();
    const run = row('run-1');
    pressWatchRow(s.host, 'row-1', run, s.ports);
    s.settle(row('run-1', REFUSED));
    expect(s.calls.slice(3)).toEqual(['checking:none', 'refuse:run-1', 'redraw']);
    expect(s.calls).not.toContain('enter');
  });

  /**
   * **The guard GitHub issue #531 item 2 says nothing drove on the board.**
   *
   * The gate is a worker round trip and a player can press *Watch* and walk away before it answers.
   * Without this the shell's `enterWatch` pulls them off wherever they went and onto somebody else's
   * run — and the host has *already* entered the spectator state by then, so it is not enough to
   * decline to navigate: that session has to be ended too.
   */
  it('enters nothing and ends the watch the gate entered, when the check lands after the screen has gone', () => {
    const s = screen();
    const run = row('run-1');
    pressWatchRow(s.host, 'row-1', run, s.ports);
    s.alive = false;
    expect(s.watching).toBe(run);
    s.settle(run);
    expect(s.calls.slice(3)).toEqual(['checking:none', 'stopWatching']);
    expect(s.calls).not.toContain('enter');
    expect(s.watching).toBeUndefined();
  });

  /**
   * And only the watch **this** press entered. A player who left this screen, opened a watch
   * somewhere else and then received this gate's answer keeps the watch they chose.
   */
  it('leaves a watch the player opened elsewhere alone', () => {
    const s = screen();
    const mine = row('run-1');
    pressWatchRow(s.host, 'row-1', mine, s.ports);
    s.alive = false;
    const somebodyElses = row('run-2');
    s.watching = somebodyElses;
    s.settle(mine);
    expect(s.calls).not.toContain('stopWatching');
    expect(s.watching).toBe(somebodyElses);
  });

  /** A refused row that lands late is not a watch at all, so there is nothing to end. */
  it('ends nothing when a check that lands after the screen has gone was refused', () => {
    const s = screen();
    pressWatchRow(s.host, 'row-1', row('run-1'), s.ports);
    s.alive = false;
    s.settle(row('run-1', REFUSED));
    expect(s.calls).not.toContain('stopWatching');
    expect(s.calls).not.toContain('refuse:run-1');
  });

  /**
   * **A second press is dropped rather than queued** — GitHub issue #410. Two runs in flight over
   * one host would land the second's answer over a spectator state the first had already entered.
   */
  it('drops a second press while a check is in flight', () => {
    const s = screen();
    pressWatchRow(s.host, 'row-1', row('run-1'), s.ports);
    const after = s.calls.length;
    pressWatchRow(s.host, 'row-2', row('run-2'), s.ports);
    expect(s.calls.slice(after)).toEqual([]);
    /* And the first press's row is still the busy one, rather than the dropped press's. */
    expect(s.checking).toBe('row-1');
  });

  it('takes the next press once the first has settled', () => {
    const s = screen();
    const first = row('run-1');
    pressWatchRow(s.host, 'row-1', first, s.ports);
    s.settle(first);
    const after = s.calls.length;
    pressWatchRow(s.host, 'row-2', row('run-2'), s.ports);
    expect(s.calls.slice(after)).toEqual(['checking:row-2', 'redraw', 'watchRun:run-2']);
  });
});
