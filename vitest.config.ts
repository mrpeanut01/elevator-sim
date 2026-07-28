import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Workspace-aware test config.
 *
 * Tests colocate with source as `*.test.ts`. Cross-package imports are aliased to
 * package *source* so `vitest run` works without a prior `tsc -b`; type resolution for
 * the same specifiers goes through project references and `dist/index.d.ts`.
 */
const src = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

const alias = {
  '@elevator-sim/core': src('core'),
  '@elevator-sim/experiments': src('experiments'),
  '@elevator-sim/cli': src('cli'),
  '@elevator-sim/viz': src('viz'),
};

const project = (name: string) => ({
  resolve: { alias },
  test: {
    name,
    root: fileURLToPath(new URL(`./packages/${name}`, import.meta.url)),
    include: ['src/**/*.test.ts'],
    environment: 'node' as const,
    // Packages legitimately have no tests until their phase lands.
    passWithNoTests: true,
  },
});

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    projects: [project('core'), project('experiments'), project('cli'), project('viz')],
  },
});
