/**
 * The two failure shapes the CLI distinguishes, and the exit codes they map to.
 *
 * Exit codes are part of the interface: `0` success, `1` the user asked for something
 * impossible, `2` the simulator itself failed. A stack trace is never the primary output of a
 * user error — {@link UsageError} carries a message that names the offending flag and the
 * values that would have worked.
 */

/** A mistake in what the user asked for. Exit code 1. Never printed with a stack. */
export class UsageError extends Error {
  /** Extra lines printed under the message: valid values, a worked example, a hint. */
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[] = []) {
    super(message);
    this.name = 'UsageError';
    this.details = details;
  }
}

/** Exit code for a user error. */
export const EXIT_USAGE = 1;

/** Exit code for an internal failure — a bug, or a simulation that refused to report. */
export const EXIT_INTERNAL = 2;

/**
 * Suggest the closest known name, for an unknown flag or id.
 *
 * Plain Levenshtein with a distance cap proportional to the length of the input: "did you mean
 * --buidling" is helpful, "did you mean --seed" for `--zzzzz` is noise.
 */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const limit = Math.max(2, Math.floor(input.length / 3));
  return best !== undefined && bestDistance <= limit ? best : undefined;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous: number[] = [];
  for (let j = 0; j <= b.length; j += 1) previous.push(j);

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
