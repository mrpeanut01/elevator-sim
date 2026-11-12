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
# `tsc -b` compiles the test files too, and the repository guards among them import dependency-free
# scripts from outside `packages/` (`scripts/*.mjs`, `infra/checks/*.mjs`, with their `.d.mts`). Without
# these two lines the build fails with fifteen TS2307/TS7006 errors. Build stage only: nothing in them
# reaches the runtime image.
COPY scripts/ scripts/
COPY infra/checks/ infra/checks/

# The library build (`tsc -b`, into each package's `dist/`) and then the viewer's web bundle
# (Vite, into `packages/viz/dist-web/`). Two outputs, two directories, deliberately not one — see
# `packages/viz/vite.config.ts`.
RUN npm run build
RUN npm run build:web -w @elevator-sim/viz

# --------------------------------------------------------------------------- litestream

# Litestream replicates the SQLite store to Blob Storage (DECISIONS.md § D1630, infra/litestream.yml).
# Fetched in a throwaway stage because the runtime image has no downloader, and checked against the
# SHA-256 of each release asset, which Litestream does not publish itself: both were taken from the
# v0.3.13 assets on 2026-11-11. 0.3.13 is the version crop-card runs in production.
FROM alpine:3.20 AS litestream
ARG TARGETARCH=amd64
ARG LITESTREAM_VERSION=0.3.13
RUN case "$TARGETARCH" in \
      amd64) sum=eb75a3de5cab03875cdae9f5f539e6aedadd66607003d9b1e7a9077948818ba0 ;; \
      arm64) sum=9585f5a508516bd66af2b2376bab4de256a5ef8e2b73ec760559e679628f2d59 ;; \
      *) echo "no litestream checksum for $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    wget -qO /tmp/litestream.tgz "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${TARGETARCH}.tar.gz" && \
    echo "$sum  /tmp/litestream.tgz" | sha256sum -c - && \
    tar -xzf /tmp/litestream.tgz -C /usr/local/bin litestream

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

# The system's certificate authorities, which `node:*-slim` does not ship. Node carries its own list,
# so the server never needed them; Litestream is a Go binary and reads the system's, and without them
# its first request to Blob Storage fails with `x509: certificate signed by unknown authority`, the
# entrypoint refuses to start, and the revision never serves. That is how the first SQLite cutover
# failed on 2026-11-12: § D1630's rehearsal ran against Azurite over plain HTTP, which has no
# certificate to verify.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Compiled output only — no sources, no tests.
COPY --from=build /app/packages/core/dist        packages/core/dist
COPY --from=build /app/packages/experiments/dist packages/experiments/dist
COPY --from=build /app/packages/server/dist      packages/server/dist
COPY --from=build /app/packages/viz/dist         packages/viz/dist
COPY --from=build /app/packages/viz/dist-web     packages/viz/dist-web
COPY --from=build /app/data                      data

COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY infra/litestream.yml /etc/litestream.yml
COPY infra/entrypoint.sh /usr/local/bin/elevator-sim-entrypoint

# `node` is a real unprivileged user in the official image. The application tree stays root-owned and
# read-only to the process that serves it. `/data` is the one writable directory: it holds the SQLite
# store when ELEVATOR_SIM_DB is a `file:` URL (§ D1630), and nothing when the store is PostgreSQL.
RUN mkdir -p /data && chown node:node /data
USER node

# Matches `main.ts`'s own default, so the two cannot drift.
ENV PORT=8787
EXPOSE 8787

# Exec form, so the entrypoint is PID 1, and it `exec`s into the server (PostgreSQL) or into
# Litestream with the server as its child (SQLite), so SIGTERM still reaches a process that handles
# it. Under the shell form a container stop would go to `/bin/sh`, the server would never be told,
# and every deploy would end in the ten-second kill rather than a clean exit.
CMD ["/usr/local/bin/elevator-sim-entrypoint"]
