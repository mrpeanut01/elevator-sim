/**
 * The page's own fault register — GitHub issue **#242**, AC1.
 *
 * ## What is being counted, and what is deliberately not
 *
 * A count, and the half of the visit it happened in. **Not the message, not the stack, not the
 * class, not the address of the page.** Each of those is left out for a reason that is written in
 * `faults.ts` and asserted below, and the shortest version is that this count's destination is a
 * **public issue in a public repository** — so `everyday/support.ts`'s own sentence, *"Your name,
 * your picture and your email address are not attached, and nothing else about you is either"*,
 * has to stay true of it.
 *
 * ## Every case is a positive control, and two of them are the defect this exists for
 *
 * `docs/27-flow-maps.md` F0's *Unavailable* row and its D5: if the application's data does not load,
 * the Everyday shell has already covered the Engineer surface's own failure notice, the player sees
 * a working-looking main menu, and every tile leads to a screen saying the boot has not finished —
 * a sentence that is false in that state and never retracted. *Recovery: none inside the product.*
 * So the two cases that matter here are the ones where a fault lands **before** the shell says it
 * mounted, and they are what makes a report from a dead page distinguishable from a report about a
 * lift going to the wrong floor.
 */
import { describe, expect, it } from 'vitest';

import { ClientFaultRegister, MAX_FAULTS_COUNTED } from './faults.js';

describe('an empty register', () => {
  it('has nothing to say', () => {
    const register = new ClientFaultRegister();
    expect(register.tally()).toEqual({ startingUp: 0, playing: 0 });
    expect(register.total()).toBe(0);
  });

  it('is still empty after the shell says it mounted', () => {
    const register = new ClientFaultRegister();
    register.shellMounted();
    expect(register.total()).toBe(0);
  });
});

describe('which half of the visit a fault landed in', () => {
  /*
   * The dead page. Until `shellMounted` is called nothing on screen is the product's, so a fault
   * here is the boot failure `docs/27` F0 says the player cannot see and cannot report.
   */
  it('counts a fault before the shell mounted as start-up', () => {
    const register = new ClientFaultRegister();
    register.record();
    register.record();
    expect(register.tally()).toEqual({ startingUp: 2, playing: 0 });
  });

  it('counts a fault after it as playing', () => {
    const register = new ClientFaultRegister();
    register.shellMounted();
    register.record();
    expect(register.tally()).toEqual({ startingUp: 0, playing: 1 });
  });

  it('keeps both halves apart across the boundary', () => {
    const register = new ClientFaultRegister();
    register.record();
    register.shellMounted();
    register.record();
    register.record();
    expect(register.tally()).toEqual({ startingUp: 1, playing: 2 });
    expect(register.total()).toBe(3);
  });

  /*
   * A mount is not an event that can happen twice, and a second call must not reopen the start-up
   * half — a shell that remounted would otherwise start attributing live faults to the boot.
   */
  it('does not go backwards if the shell says it mounted twice', () => {
    const register = new ClientFaultRegister();
    register.shellMounted();
    register.record();
    register.shellMounted();
    register.record();
    expect(register.tally()).toEqual({ startingUp: 0, playing: 2 });
  });
});

describe('the bound', () => {
  /*
   * A fault inside a render loop or a resize handler fires every frame. Without a ceiling this
   * register is an unbounded counter feeding a text field a player is about to make public, and
   * the difference between *ninety-nine* and *four hundred thousand* is of no use to anybody
   * reading the report.
   */
  it('stops counting at the ceiling rather than growing without one', () => {
    const register = new ClientFaultRegister();
    for (let index = 0; index < MAX_FAULTS_COUNTED + 500; index += 1) register.record();
    expect(register.tally().startingUp).toBe(MAX_FAULTS_COUNTED);
  });

  it('bounds each half on its own, so a flood in one does not hide the other', () => {
    const register = new ClientFaultRegister();
    for (let index = 0; index < MAX_FAULTS_COUNTED + 500; index += 1) register.record();
    register.shellMounted();
    register.record();
    expect(register.tally()).toEqual({ startingUp: MAX_FAULTS_COUNTED, playing: 1 });
  });

  it('is a ceiling a reader can act on rather than a round number nobody meets', () => {
    expect(MAX_FAULTS_COUNTED).toBeGreaterThan(1);
    expect(MAX_FAULTS_COUNTED).toBeLessThan(1_000);
  });
});

describe('what a register cannot be asked for', () => {
  /*
   * The assertion that stops a later field being added quietly. Whatever this register grows, the
   * thing it hands out must stay two numbers — because the next person to want a stack trace in a
   * bug report will be right about it being useful and wrong about where the report goes.
   */
  it('hands out two numbers and nothing else', () => {
    const register = new ClientFaultRegister();
    register.record();
    expect(Object.keys(register.tally()).sort()).toEqual(['playing', 'startingUp']);
    for (const value of Object.values(register.tally())) expect(typeof value).toBe('number');
  });

  /*
   * `record` takes nothing. That is the enforcement rather than a convention: there is no argument
   * through which an error, a message or a URL could reach this register in the first place, so no
   * later caller can pass one and no reviewer has to notice that they did.
   */
  it('takes no argument, so there is nothing an error could be passed through', () => {
    expect(new ClientFaultRegister().record.length).toBe(0);
  });
});
