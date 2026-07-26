/**
 * Seeded per-source random streams.
 *
 * Barrel for `core/src/random` only. Simulation code should take a {@link StreamSet} by
 * injection and draw from its named streams — never construct a {@link Pcg32} inline, and
 * never share one stream between two stochastic sources. See CLAUDE.md invariant 2 and
 * docs/01-architecture.md § Determinism strategy.
 */

export { Pcg32 } from './rng.js';
export type { Rng, RngState } from './rng.js';

/**
 * Alias for the spelling used in docs/01-architecture.md. `Rng` is the canonical name;
 * this exists so code transcribed from the architecture doc compiles.
 */
export type { Rng as RNG } from './rng.js';

export { StreamSet, STREAM_NAMES, deriveStreamSeed, normalizeSeed } from './streams.js';
export type { StreamName, StreamSeed, StreamSetSnapshot } from './streams.js';
