/**
 * The bridge's one contract: what is provided is what is read, arrival is heard, and before any
 * arrival the answer is honestly `undefined` — the state the settings screen turns into the
 * Motion row's absence rather than a dead toggle (§ 20.12).
 */

import { describe, expect, it } from 'vitest';

import {
  engineerSettings,
  onEngineerSettingsProvided,
  provideEngineerSettings,
  type EngineerSettingsBridge,
} from './engineerBridge.js';

function fakeBridge(): EngineerSettingsBridge & { readonly writes: boolean[] } {
  const writes: boolean[] = [];
  let value = false;
  return {
    writes,
    reduceMotion: () => value,
    setReduceMotion: (next) => {
      writes.push(next);
      value = next;
    },
  };
}

describe('the engineer settings bridge', () => {
  it('answers undefined before anything is provided — the still-booting window is a real state', () => {
    // First in the file on purpose: module state is per-file under vitest isolation, so this is
    // the same pre-boot window a fast player hits on the page.
    expect(engineerSettings()).toBeUndefined();
  });

  it('hands back exactly what dev/main provided, and the write reaches it', () => {
    const bridge = fakeBridge();
    provideEngineerSettings(bridge);
    expect(engineerSettings()).toBe(bridge);
    engineerSettings()?.setReduceMotion(true);
    expect(bridge.writes).toEqual([true]);
    expect(engineerSettings()?.reduceMotion()).toBe(true);
  });

  it('notifies a waiting listener on arrival, and not after unsubscribing', () => {
    let heard = 0;
    const stop = onEngineerSettingsProvided(() => {
      heard += 1;
    });
    provideEngineerSettings(fakeBridge());
    expect(heard).toBe(1);
    stop();
    provideEngineerSettings(fakeBridge());
    expect(heard).toBe(1);
  });
});
