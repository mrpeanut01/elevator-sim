# The deployed artefact: the viewer and the API, one origin, one process.
#
# Two stages, and the split is about what ends up in the image rather than about build speed. The
# builder needs every devDependency — TypeScript, Vite, and `@electric-sql/pglite`, which is an
# entire PostgreSQL compiled to WebAssembly and has no business in a production image. The runtime
# stage installs with `--omit=dev`, so none of that ships.
#
# ## The layout is load-bearing
#
# `packages/server/src/main.ts` resolves its two directories relative to its own location:
# `../../../data/` for the reference data and `../../viz/dist-web/` for the viewer. Keeping the
# repository's shape under `/app` means both defaults are correct in the container and neither
# `ELEVATOR_SIM_DATA` nor `ELEVATOR_SIM_WEB` has to be set for the image to work. Flattening the
# tree would mean two more environment variables that are wrong by default.

# --------------------------------------------------------------------------- build

FROM node:26-slim AS build
WORKDIR /app

# Manifests first, so `npm ci` is only re-run when a dependency actually changes. Every workspace
# package.json has to be here before the install, because npm links the workspaces during it.
COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json      packages/core/
COPY packages/experiments/package.json packages/experiments/
COPY packages/server/package.json    packages/server/
COPY packages/cli/package.json       packages/cli/
COPY packages/viz/package.json       packages/viz/

RUN npm ci

COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY data/ data/

# The library build (`tsc -b`, into each package's `dist/`) and then the viewer's web bundle
# (Vite, into `packages/viz/dist-web/`). Two outputs, two directories, deliberately not one — see
# `packages/viz/vite.config.ts`.
RUN npm run build
RUN npm run build:web -w @elevator-sim/viz

# --------------------------------------------------------------------------- runtime

FROM node:26-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Production dependencies only. This is what keeps PGlite, Vite and TypeScript out of the image;
# the tests' in-process PostgreSQL is a devDependency precisely so that this line excludes it.
COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json      packages/core/
COPY packages/experiments/package.json packages/experiments/
COPY packages/server/package.json    packages/server/
COPY packages/cli/package.json       packages/cli/
COPY packages/viz/package.json       packages/viz/
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output only — no sources, no tests.
COPY --from=build /app/packages/core/dist        packages/core/dist
COPY --from=build /app/packages/experiments/dist packages/experiments/dist
COPY --from=build /app/packages/server/dist      packages/server/dist
COPY --from=build /app/packages/viz/dist         packages/viz/dist
COPY --from=build /app/packages/viz/dist-web     packages/viz/dist-web
COPY --from=build /app/data                      data

# `node` is a real unprivileged user in the official image. Nothing here writes to the filesystem —
# the database is PostgreSQL and the mailer is an HTTP client — so the whole tree stays root-owned
# and read-only to the process that serves it.
USER node

# Matches `main.ts`'s own default, so the two cannot drift.
ENV PORT=8787
EXPOSE 8787

# Exec form, so the process is PID 1 and receives SIGTERM directly. Under the shell form a
# container stop would go to `/bin/sh`, the server would never be told, and every deploy would end
# in the ten-second kill rather than a clean exit.
CMD ["node", "packages/server/dist/main.js"]
