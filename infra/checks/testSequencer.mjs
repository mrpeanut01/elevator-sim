/**
 * **Shard by time, not by file count, and start the slowest file first.**
 *
 * Vitest's own `--shard=i/n` sorts test files by a hash of their path and cuts the list into `n`
 * runs of equal length. Equal length is not equal time: in CI run 43157297755 the two `viz` shards
 * carried 32 and 43 minutes of test time, and the slower one set the whole suite's wall clock. With
 * no results cache on a fresh runner its default order is "larger file first", so a file that takes
 * seven minutes can start last and run alone at the end of the leg.
 *
 * This sequencer weighs every file by its measured duration from `test-durations.json` (refreshed
 * by `scripts/test-durations.mjs`) and
 *
 *   - **shards** with longest-processing-time-first bin packing: files in descending weight, each
 *     into the lightest shard so far. Every shard computes the same packing over the same file
 *     list, so the shards are disjoint and together cover every file.
 *   - **sorts** each run's files heaviest first, after any file vitest's local cache says failed
 *     last time, so the long files overlap with everything else instead of trailing it.
 *
 * A file the table does not name is weighed at its project's median. A stale table therefore makes
 * the shards less even and never drops or doubles a file.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer } from 'vitest/node';

export const DURATIONS_URL = new URL('./test-durations.json', import.meta.url);

/** `project:path-from-repo-root` → seconds of test time. */
export function loadDurations(url = DURATIONS_URL) {
  return JSON.parse(readFileSync(url, 'utf8')).seconds;
}

const median = (values) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The weight of every key: its measured duration, or the median of its project's measured files,
 * or the median of the whole table, or 1.
 */
export function weigh(keys, durations) {
  const all = Object.values(durations);
  const projectMedian = new Map();
  for (const [key, seconds] of Object.entries(durations)) {
    const project = key.slice(0, key.indexOf(':'));
    projectMedian.set(project, [...(projectMedian.get(project) ?? []), seconds]);
  }
  for (const [project, values] of projectMedian) projectMedian.set(project, median(values));
  const fallback = median(all) ?? 1;
  return keys.map((key) => {
    const known = durations[key];
    if (typeof known === 'number') return known;
    return projectMedian.get(key.slice(0, key.indexOf(':'))) ?? fallback;
  });
}

/** Heaviest first; equal weights in key order, so the result never depends on input order. */
const byWeightThenKey = (items) =>
  [...items].sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/**
 * Longest-processing-time-first packing of `items` (`{ key, weight }`) into `count` shards.
 * Returns the zero-based shard of each key and every shard's total weight.
 */
export function partition(items, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`a shard count must be a positive integer, not ${String(count)}`);
  const loads = Array.from({ length: count }, () => 0);
  const shardOf = new Map();
  for (const { key, weight } of byWeightThenKey(items)) {
    let lightest = 0;
    for (let i = 1; i < count; i += 1) if (loads[i] < loads[lightest]) lightest = i;
    shardOf.set(key, lightest);
    loads[lightest] += weight;
  }
  return { shardOf, loads };
}

export default class DurationSequencer extends BaseSequencer {
  durations = loadDurations();

  /** The key vitest's own results cache uses, which is also the key the durations table uses. */
  keyOf(spec) {
    return `${spec.project.name}:${relative(this.ctx.config.root, spec.moduleId).split('\\').join('/')}`;
  }

  weighted(files) {
    const keys = files.map((spec) => this.keyOf(spec));
    const weights = weigh(keys, this.durations);
    return files.map((spec, i) => ({ spec, key: keys[i], weight: weights[i] }));
  }

  async shard(files) {
    const { index, count } = this.ctx.config.shard;
    const items = this.weighted(files);
    const { shardOf } = partition(items, count);
    return items.filter((item) => shardOf.get(item.key) === index - 1).map((item) => item.spec);
  }

  async sort(files) {
    const cache = this.ctx.cache;
    const failed = (key) => cache.getFileTestResults(key)?.failed === true;
    return byWeightThenKey(this.weighted(files))
      .sort((a, b) => {
        const group = a.spec.project.config.sequence.groupOrder - b.spec.project.config.sequence.groupOrder;
        if (group !== 0) return group;
        /* Kept from vitest's own sequencer, which runs one project's files together. */
        const pa = a.spec.project.name;
        const pb = b.spec.project.name;
        if (pa !== pb) return pa < pb ? -1 : 1;
        return Number(failed(b.key)) - Number(failed(a.key));
      })
      .map((item) => item.spec);
  }
}
