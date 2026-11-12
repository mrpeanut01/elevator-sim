import type { BaseSequencer, TestSpecification } from 'vitest/node';

export declare const DURATIONS_URL: URL;
export declare function loadDurations(url?: URL): Readonly<Record<string, number>>;
export declare function weigh(
  keys: readonly string[],
  durations: Readonly<Record<string, number>>,
): number[];
export declare function partition(
  items: readonly { readonly key: string; readonly weight: number }[],
  count: number,
): { shardOf: Map<string, number>; loads: number[] };
export default class DurationSequencer extends BaseSequencer {
  shard(files: TestSpecification[]): Promise<TestSpecification[]>;
  sort(files: TestSpecification[]): Promise<TestSpecification[]>;
}
