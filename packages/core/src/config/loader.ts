/// <reference types="node" />

/**
 * Filesystem entry point for the JSON reference data.
 *
 * `loadConfig(dir)` reads a data directory laid out like the repository's `data/`:
 *
 * ```
 * <dir>/elevator-specs.json
 * <dir>/traffic-profiles.json
 * <dir>/dispatcher-profiles.json
 * <dir>/buildings/*.json
 * ```
 *
 * **This is the only file in the config module that imports `node:` anything.** All the
 * validation lives in `parse.ts`, which is pure and fs-free, so a browser build can import
 * `parseBuilding`/`resolveBuilding` from `./parse.js` without pulling `node:fs` into its
 * module graph (CLAUDE.md invariant 6, and Phase 4's "web viewer consuming core"). Keep it
 * that way: anything that does not touch the disk belongs in `parse.ts`.
 *
 * The diagnostics rules are documented in `parse.ts`: report everything wrong at once,
 * located by file and JSON path; errors mean unusable, warnings mean suspicious.
 */

import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
  DATA_FILES,
  LAYOUT_HINT,
  crossCheckDispatcherProfiles,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from './parse.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type {
  ConfigIssue,
  ConfigWarning,
  CostTerm,
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpec,
  ElevatorSpecs,
  LoadedConfig,
  ResolvedBuilding,
  TrafficProfile,
  TrafficProfiles,
} from './types.js';

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read and `JSON.parse` a file, reporting both failure modes as `ConfigError`. */
async function readJsonFile(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT') {
      throw new ConfigError(
        [
          {
            file,
            path: '',
            message: `file not found. ${LAYOUT_HINT}`,
            code: ISSUE_CODES.missingFile,
          },
        ],
        { summary: 'Cannot load configuration: 1 problem' },
      );
    }
    throw new ConfigError(
      [
        {
          file,
          path: '',
          message: `cannot read file (${code ?? 'unknown error'}): ${errorMessage(error)}`,
          code: ISSUE_CODES.unreadableFile,
        },
      ],
      { summary: 'Cannot load configuration: 1 problem' },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ConfigError(
      [
        {
          file,
          path: '',
          message: `not valid JSON: ${errorMessage(error)}`,
          code: ISSUE_CODES.invalidJson,
        },
      ],
      { summary: 'Cannot load configuration: 1 problem' },
    );
  }
}

/** Collect the issues from a `ConfigError`, rethrowing anything else. */
function collect(issues: ConfigIssue[], error: unknown): void {
  if (!(error instanceof ConfigError)) throw error;
  issues.push(...error.issues);
}

/**
 * Load and validate every config file under `dataDir`.
 *
 * @param dataDir path to the data directory, absolute or relative to `process.cwd()`.
 * @throws ConfigError listing every problem across every file.
 */
export async function loadConfig(dataDir: string): Promise<LoadedConfig> {
  const root = isAbsolute(dataDir) ? dataDir : resolve(dataDir);
  const specsFile = join(root, DATA_FILES.elevatorSpecs);
  const trafficFile = join(root, DATA_FILES.trafficProfiles);
  const dispatcherFile = join(root, DATA_FILES.dispatcherProfiles);
  const buildingsDir = join(root, DATA_FILES.buildingsDir);

  const issues: ConfigIssue[] = [];
  const warnings: ConfigWarning[] = [];

  let specs: ElevatorSpecs | undefined;
  let traffic: TrafficProfiles | undefined;
  let dispatchers: DispatcherProfiles | undefined;

  const [specsJson, trafficJson, dispatcherJson] = await Promise.all([
    readJsonFile(specsFile).catch((error: unknown) => error),
    readJsonFile(trafficFile).catch((error: unknown) => error),
    readJsonFile(dispatcherFile).catch((error: unknown) => error),
  ]);

  try {
    if (specsJson instanceof Error) throw specsJson;
    specs = parseElevatorSpecs(specsJson, specsFile);
  } catch (error) {
    collect(issues, error);
  }
  try {
    if (trafficJson instanceof Error) throw trafficJson;
    traffic = parseTrafficProfiles(trafficJson, trafficFile);
  } catch (error) {
    collect(issues, error);
  }
  try {
    if (dispatcherJson instanceof Error) throw dispatcherJson;
    dispatchers = parseDispatcherProfiles(dispatcherJson, dispatcherFile);
  } catch (error) {
    collect(issues, error);
  }

  if (dispatchers !== undefined) {
    warnings.push(...crossCheckDispatcherProfiles(dispatchers, dispatcherFile));
  }

  let buildingFiles: string[] = [];
  try {
    const entries = await readdir(buildingsDir, { withFileTypes: true });
    buildingFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      // Sorted so the load order — and therefore diagnostics order — is deterministic.
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (buildingFiles.length === 0) {
      issues.push({
        file: buildingsDir,
        path: '',
        message: `no building configs found. ${LAYOUT_HINT}`,
        code: ISSUE_CODES.noBuildings,
      });
    }
  } catch (error) {
    issues.push({
      file: buildingsDir,
      path: '',
      message:
        errorCode(error) === 'ENOENT'
          ? `buildings directory not found. ${LAYOUT_HINT}`
          : `cannot read buildings directory: ${errorMessage(error)}`,
      code: errorCode(error) === 'ENOENT' ? ISSUE_CODES.missingFile : ISSUE_CODES.unreadableFile,
    });
  }

  const buildings: ResolvedBuilding[] = [];
  const buildingsById = new Map<string, ResolvedBuilding>();

  if (specs !== undefined) {
    const trafficProfileIds =
      traffic === undefined ? undefined : new Set(traffic.profiles.map((profile) => profile.id));

    for (const name of buildingFiles) {
      const file = join(buildingsDir, name);
      let raw: unknown;
      try {
        raw = await readJsonFile(file);
      } catch (error) {
        collect(issues, error);
        continue;
      }
      let resolved: ResolvedBuilding;
      try {
        const parsed = parseBuilding(raw, file);
        resolved = resolveBuilding(parsed, specs, {
          file,
          ...(trafficProfileIds === undefined ? {} : { trafficProfileIds }),
        });
      } catch (error) {
        collect(issues, error);
        continue;
      }
      const clash = buildingsById.get(resolved.id);
      if (clash !== undefined) {
        issues.push({
          file,
          path: 'id',
          message: `duplicate building id "${resolved.id}"; already declared by ${clash.source}. Building ids must be unique within a data directory.`,
          code: ISSUE_CODES.duplicateId,
        });
        continue;
      }
      buildings.push(resolved);
      buildingsById.set(resolved.id, resolved);
      warnings.push(...resolved.warnings);
    }
  }

  if (issues.length > 0) {
    throw new ConfigError(issues, {
      summary: `Invalid configuration in ${root}: ${issues.length} problem${issues.length === 1 ? '' : 's'}`,
      hint: 'Schema reference: data/buildings/README.md, docs/02-elevator-reference.md, docs/03-traffic-and-statistics.md, docs/06-parameterization-and-tuning.md.',
    });
  }

  // Unreachable unless a parse failed, which would have thrown above.
  /* c8 ignore next 3 */
  if (specs === undefined || traffic === undefined || dispatchers === undefined) {
    throw new ConfigError([
      { file: root, path: '', message: 'configuration incomplete', code: ISSUE_CODES.missingFile },
    ]);
  }

  return {
    dataDir: root,
    elevatorSpecs: specs,
    trafficProfiles: traffic,
    dispatcherProfiles: dispatchers,
    buildings,
    buildingsById,
    specsById: new Map<string, ElevatorSpec>(
      specs.classes.map((elevatorClass) => [elevatorClass.id, elevatorClass]),
    ),
    trafficProfilesById: new Map<string, TrafficProfile>(
      traffic.profiles.map((profile) => [profile.id, profile]),
    ),
    dispatcherProfilesById: new Map<string, DispatcherProfile>(
      dispatchers.profiles.map((profile) => [profile.id, profile]),
    ),
    costTermsById: new Map<string, CostTerm>(dispatchers.terms.map((term) => [term.id, term])),
    warnings,
  };
}
