# Cheat — multi-stage build producing a single self-contained binary.
# No network egress at run time; the SPA is embedded via go:embed.

# Base images are pinned by digest for reproducible, tamper-evident builds; the
# human-readable tag is kept for reference. Refresh deliberately: re-pull the tag,
# then update the @sha256 below (e.g. `podman image inspect <tag> --format
# '{{index .RepoDigests 0}}'`).

# --- Stage 1: build the Vite SPA -------------------------------------------
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build the Go binary (pure-Go, CGO disabled) ------------------
FROM golang:1.25-alpine@sha256:2b6edeb8c6b1071bfa16473f24bb7b7da0b1579009f97bb1542f239b14aabd8f AS backend
ARG VERSION=0.0.0-docker
ENV CGO_ENABLED=0
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Drop the committed placeholder and drop in the real SPA at the embed path.
RUN rm -rf ./dist && mkdir -p ./dist
COPY --from=frontend /app/frontend/dist/ ./dist/
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/cheat .

# --- Stage 3: minimal runtime ----------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot@sha256:7a2bd171a18bdd39a4729600d0dca5f16e779d41156a6908b4f8a9a289e76d92
COPY --from=backend /out/cheat /cheat
# Run as the distroless nonroot user (UID/GID 65532) — stated explicitly so the
# property does not silently depend on the base tag. WORKDIR is nonroot's own
# home, so the default CHEAT_DB (./cheat.db) is writable without a volume.
USER 65532:65532
WORKDIR /home/nonroot
# The server binds CHEAT_HOST (default 0.0.0.0 — all interfaces) so it is
# reachable via a published port on a normal bridge network:
#     docker run --rm -p 0.0.0.0:8787:8787 cheat:latest   (LAN-exposed; ephemeral DB)
# For a persistent dataset, mount a volume and point CHEAT_DB at it (see the
# Makefile). There is NO auth and NO TLS: publishing to 0.0.0.0 exposes the whole
# (cleartext) dataset to the LAN. For loopback-only, set CHEAT_HOST=127.0.0.1
# and publish on 127.0.0.1 (or use an SSH local port-forward for remote access).
EXPOSE 8787
# Self-probe (no shell/curl in distroless): reads CHEAT_HOST/CHEAT_PORT from env.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/cheat", "-healthcheck"]
ENTRYPOINT ["/cheat"]
