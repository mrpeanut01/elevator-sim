/**
 * **The sink** — the half of GitHub issue **#258** that makes a noise. Every judgement it acts on
 * was made in `everyday/audio.ts`; this file decides *nothing* about when a cue fires, which tier
 * a speed is in, or how loud the crowd is, and `docs/16` S2 is why: *"the sink must be the
 * **shipped** decision, not a restatement of it"*. A sink that recomputed the crossover would
 * assert its own arithmetic and pass whether or not the control above it was connected to
 * anything.
 *
 * ## Nothing here is a file, and that is the design rather than a shortcut
 *
 * `docs/29` § 2.2 measured it: `packages/viz` has never shipped a binary asset, and § 4.3 and § 4.4
 * price the first one — bytes against `charter S9`'s only slack, plus a licence, a provenance
 * record, an attribution surface, an encoding pipeline and a size guard, *"a set of standing
 * obligations this project has never carried"*. **Every sound below is synthesised from
 * oscillators and a generated noise buffer**, so the asset weight this ships is zero and § 4.4's
 * obligations do not arrive with it. The trade is honest and worth stating: synthesis buys a
 * chime that is recognisably a chime rather than a recording of a real lift, and `docs/29`'s own
 * § 3 never asked for the second thing.
 *
 * It is also what makes `docs/31`'s **B2** measurable rather than argued. The audio's contribution
 * to *total transferred bytes* is this file's own minified size and nothing else — no media type
 * to declare in `staticwebapp.config.json`, no `media-src` to add to the CSP, and no second public
 * path beside `data/`, which `docs/29` § 4.3 lists as the three deployment costs a first asset
 * would have brought.
 *
 * ## Why there is no node-tier unit test of the graph, said plainly
 *
 * This is a DOM half in every sense but the pattern: it owns the `AudioContext` and the node graph
 * and nothing else, exactly as `everyday/settingsScreen.ts` owns elements and `stageScreen.ts`
 * owns the frame loop. Those files are driven by the browser tier and not by this one, and a node
 * fake of `AudioContext` would be a hand-written mock asserting its own shape — the *fake sink*
 * `scope/` exists to catch. What **is** tested here, in the node tier and exhaustively, is
 * `everyday/audio.ts`: which cue, which tier, how loud, and whether the player asked for silence.
 *
 * It touches no `window` and no `document` — the context is handed to it — so it is not in
 * `boundaries.test.ts#EVERYDAY_SHELL_FILES` and does not need to be. `everyday/stageScreen.ts`,
 * which is, is the one non-test caller.
 */

import type { AudioCue, AudioPlan } from './audio.js';

/* -------------------------------------------------------------------------- *
 * The levels — all of them background, which is § D344's fifth clause
 * -------------------------------------------------------------------------- */

/**
 * The ceiling on everything this file plays, as a linear gain.
 *
 * § D344 asks for *"background level … and explicitly not annoying"*, and a ceiling on the master
 * is the only place that can be made true once rather than five times. A player who wants it
 * louder has the operating system's own volume, which is a control this product should not be
 * duplicating.
 */
const MASTER_GAIN = 0.22;

/** The bed's share of the master at {@link AudioPlan.bedLevel} `1`. Under the chime by design. */
const BED_GAIN_AT_FULL = 0.55;

/** Seconds the bed takes to follow a change in density. Long, so a crowd swells rather than jumps. */
const BED_GLIDE_S = 1.5;

/** The chime's two partials, hertz — a perfect fifth, the interval a real hall lantern strikes. */
const CHIME_HZ: readonly [number, number] = [880, 1318.51];

/** How long a chime rings, seconds. Comfortably over `MIN_IDENTIFIABLE_CUE_S`. */
const CHIME_DECAY_S = 0.9;

/** How long a door cue lasts, seconds. Shorter than the chime; it is a texture, not an event. */
const DOOR_DECAY_S = 0.28;

/** The door cue's noise band, hertz — low and narrow, so it reads as a mechanism rather than a hiss. */
const DOOR_BAND_HZ = 320;

/** The bed's noise band, hertz. A room, not a waterfall. */
const BED_BAND_HZ = 900;

/** One second of noise, looped. Long enough that the loop point is not a rhythm. */
const NOISE_BUFFER_S = 1;

/* -------------------------------------------------------------------------- *
 * The sink
 * -------------------------------------------------------------------------- */

/** What `everyday/stageScreen.ts` holds, and the whole of what it may do to the sound. */
export interface AudioSink {
  /**
   * Play one frame's plan. Total: a plan whose {@link AudioPlan.silent} is set fades the bed out
   * and strikes nothing, which is the whole of what mute means at this layer.
   */
  play(plan: AudioPlan): void;
  /**
   * Real seconds, for the chime rate limiter `everyday/audio.ts` runs on its own input.
   *
   * The context's own clock rather than a `performance.now()`: `boundaries.test.ts` keeps the wall
   * clock in `playback/clock.ts` and exempts nobody from that, and the context is already holding
   * a monotonic real-time reading for its own scheduling. One clock, already injected.
   */
  now(): number;
  /** Let the context out of the browser's autoplay suspension. Called from a player gesture. */
  wake(): void;
  /** Stop everything and release the graph. Called on unmount. */
  close(): void;
}

/**
 * Build the sink over a context the caller owns.
 *
 * The context is a parameter rather than a `new AudioContext()` here for the reason
 * `dev/motion.ts` takes `matchMedia`: the module that decides is not the module that reaches for
 * the browser, and the one place a context is constructed should be the one file already exempted
 * for owning the outside world.
 */
export function createAudioSink(context: AudioContext): AudioSink {
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);

  /* ---- the bed: one looping noise source, filtered, on a gain the plan drives ---- */
  const noise = context.createBufferSource();
  noise.buffer = pinkishBuffer(context);
  noise.loop = true;
  const bedBand = context.createBiquadFilter();
  bedBand.type = 'lowpass';
  bedBand.frequency.value = BED_BAND_HZ;
  const bedGain = context.createGain();
  bedGain.gain.value = 0;
  noise.connect(bedBand);
  bedBand.connect(bedGain);
  bedGain.connect(master);
  noise.start();

  let closed = false;

  return {
    play(plan: AudioPlan): void {
      if (closed) return;
      const now = context.currentTime;
      const wanted = plan.silent ? 0 : plan.bedLevel * BED_GAIN_AT_FULL;
      /*
       * `setTargetAtTime` rather than a ramp: the density is re-read every frame, and a ramp
       * scheduled sixty times a second fights the fifty-nine before it. An exponential approach
       * is the shape that survives being re-aimed.
       */
      bedGain.gain.setTargetAtTime(wanted, now, BED_GLIDE_S / 3);
      if (plan.silent) return;
      for (const cue of plan.cues) strike(context, master, cue, now);
    },
    now(): number {
      return context.currentTime;
    },
    wake(): void {
      if (closed) return;
      /* `resume` is a promise the caller has nothing to do with; a failed wake is simply silence. */
      void context.resume().catch(() => undefined);
    },
    close(): void {
      if (closed) return;
      closed = true;
      try {
        noise.stop();
      } catch {
        /* Already stopped, which is the state this method wanted anyway. */
      }
      master.disconnect();
    },
  };
}

/* -------------------------------------------------------------------------- *
 * The two voices
 * -------------------------------------------------------------------------- */

/** One cue, struck now. Every node it makes is transient and disconnects itself when it decays. */
function strike(context: AudioContext, into: GainNode, cue: AudioCue, now: number): void {
  if (cue.kind === 'arrival') {
    for (const [index, hz] of CHIME_HZ.entries()) {
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.value = hz;
      const envelope = context.createGain();
      /* The upper partial under the lower, so the two read as one bell rather than two tones. */
      const peak = index === 0 ? 0.5 : 0.28;
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(peak, now + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + CHIME_DECAY_S);
      partial.connect(envelope);
      envelope.connect(into);
      partial.start(now);
      partial.stop(now + CHIME_DECAY_S);
    }
    return;
  }
  const source = context.createBufferSource();
  source.buffer = pinkishBuffer(context);
  const band = context.createBiquadFilter();
  band.type = 'lowpass';
  band.frequency.value = DOOR_BAND_HZ;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(0.35, now + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + DOOR_DECAY_S);
  source.connect(band);
  band.connect(envelope);
  envelope.connect(into);
  source.start(now);
  source.stop(now + DOOR_DECAY_S);
}

/**
 * A second of noise with the high end already rolled off — the raw material for both the bed and
 * the door.
 *
 * A one-pole average over white noise rather than a proper pink filter: the difference is
 * inaudible under a lowpass at {@link BED_BAND_HZ}, and the arithmetic is four lines that no
 * reader has to take on trust. The buffer is generated rather than fetched, which is the whole
 * argument of this file's docstring.
 *
 * **The white noise comes from a local counter and not from `Math.random()`**, on
 * `render/canvas.ts`'s own ground one directory over: invariant 2 is about the simulation's random
 * numbers and a noise buffer is not one of them, but a renderer whose output depends on how many
 * times it has been built is a property this package deliberately does not have. The habit is
 * worth keeping, and it costs one multiplication.
 */
function pinkishBuffer(context: AudioContext): AudioBuffer {
  const frames = Math.floor(context.sampleRate * NOISE_BUFFER_S);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let state = 0x2545f491;
  let last = 0;
  for (let i = 0; i < frames; i += 1) {
    /* A 32-bit xorshift, inlined: three shifts, no state anybody else can reach. */
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const white = (state >>> 0) / 0x80000000 - 1;
    last = (last + 0.03 * white) / 1.03;
    channel[i] = last * 3;
  }
  return buffer;
}
