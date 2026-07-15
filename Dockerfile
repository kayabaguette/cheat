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
# The server binds 127.0.0.1 only (loopback, SPEC Q168). Inside a container
# that is NOT reachable via a published port. To use the image, either run
# with the host network (recommended for this loopback-only design):
#     docker run --rm --network host cheat:latest
# A plain `-p 8787:8787` mapping will NOT reach a 127.0.0.1 listener. The
# localhost bind is intentional (zero network egress); do not expose it to a
# LAN. For remote access use an SSH local port-forward, not a LAN publish.
EXPOSE 8787
ENTRYPOINT ["/cheat"]
