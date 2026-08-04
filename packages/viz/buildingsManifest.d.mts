/**
 * Types for `buildingsManifest.mjs`.
 *
 * Hand-written because the module is plain ESM on purpose (see its docstring): it has to be
 * `import`able from a Vite config, from vitest, and from a plain `node` invocation with no build
 * step in front of any of them. Its one TypeScript consumer is
 * `src/dev/buildingsManifest.test.ts`, which without this file fails `tsc -b` with TS7016 —
 * *"implicitly has an 'any' type"* — under this repository's strict mode.
 *
 * The surface is four functions and three constants, so the duplication is small and bounded. The
 * test imports every one of them, which is what stops this file drifting from the module silently:
 * a renamed or removed export fails the typecheck rather than the suite.
 */

/** `{ files: [{ name, data }] }` — the shape `dev/data.ts` destructures. */
export interface BuildingsManifest {
  readonly files: readonly { readonly name: string; readonly data: unknown }[];
}

/** The path `dev/data.ts` fetches. */
export declare const MANIFEST_PATH: string;

/** Its name in a build output directory. */
export declare const MANIFEST_FILE_NAME: string;

/** The hosting rules copied into the build output. */
export declare const HOST_CONFIG_FILE_NAME: string;

/** Every `data/buildings/*.json`, parsed, sorted by file name. */
export declare function readBuildingsManifest(dataDir: string): Promise<BuildingsManifest>;

/** The one serializer. Both plugins go through it. */
export declare function serializeManifest(manifest: BuildingsManifest): string;

/**
 * A Vite plugin, typed only as far as the guard drives it.
 *
 * Deliberately not `import('vite').Plugin`: that would make this package's *type* surface depend
 * on the bundler, and Vite is a devDependency that nothing in `dist/` may require. The structural
 * shape below is what the test invokes and nothing more.
 */
export interface ManifestPlugin {
  readonly name: string;
  readonly apply?: 'serve' | 'build';
  readonly configureServer?: (server: {
    middlewares: {
      use: (
        path: string,
        handler: (
          request: unknown,
          response: {
            statusCode: number;
            setHeader: (key: string, value: string) => void;
            end: (body: string) => void;
          },
        ) => void,
      ) => void;
    };
  }) => void;
  readonly generateBundle?: (this: {
    emitFile: (file: { type: string; fileName: string; source: string }) => void;
  }) => Promise<void>;
  readonly writeBundle?: (options: { dir?: string }) => Promise<void>;
}

/** Dev-server half: serves the manifest at {@link MANIFEST_PATH}. */
export declare function buildingsManifestPlugin(dataDir: string): ManifestPlugin;

/** Build half: writes the manifest into the output, and the hosting rules beside it. */
export declare function emitStaticDataPlugin(
  dataDir: string,
  hostConfigPath: string,
): ManifestPlugin;
