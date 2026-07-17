# Cheat — multi-stage build producing a single self-contained binary.
# No network egress at run time; the SPA is embedded via go:embed.

# --- Stage 1: build the Vite SPA -------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build the Go binary (pure-Go, CGO disabled) ------------------
FROM golang:1.25-alpine AS backend
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
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/cheat /cheat
# The server binds CHEAT_HOST (default 0.0.0.0 — all interfaces) so it is
# reachable via a published port on a normal bridge network:
#     docker run --rm -p 0.0.0.0:8787:8787 cheat:latest   (LAN-exposed)
# There is NO auth and NO TLS: publishing to 0.0.0.0 exposes the whole
# (cleartext) dataset to the LAN. For loopback-only, set CHEAT_HOST=127.0.0.1
# and publish on 127.0.0.1 (or use an SSH local port-forward for remote access).
EXPOSE 8787
ENTRYPOINT ["/cheat"]
