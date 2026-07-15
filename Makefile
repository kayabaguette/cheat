# Cheat — build & delivery.
# Default flow runs the app through a container engine (podman preferred, docker
# fallback). Native targets remain for local builds/CI without a container.
# The server is loopback-only by design (SPEC R1/Q168); see NET below.

SHELL       := /bin/bash
ROOT        := $(CURDIR)
FRONTEND    := $(ROOT)/frontend
BACKEND     := $(ROOT)/backend
EMBED_DIST  := $(BACKEND)/dist
BIN         := $(ROOT)/cheat
VERSION     ?= 0.0.0-dev
CHEAT_PORT  ?= 8787
# Release flags: strip debug symbols/metadata (OPSEC), stamp version.
LDFLAGS     := -s -w -X main.version=$(VERSION)

# Container engine: prefer podman, fall back to docker.
ENGINE      ?= $(shell if command -v podman >/dev/null 2>&1; then echo podman; elif command -v docker >/dev/null 2>&1; then echo docker; fi)
IMAGE       ?= cheat
TAG         ?= $(VERSION)
NAME        ?= cheat
# Loopback-only by design: the container joins the host network namespace so the
# process binds the host's 127.0.0.1 directly. A plain `-p` mapping cannot reach
# a 127.0.0.1 listener, and publishing to 0.0.0.0 would expose it to the LAN
# (forbidden by R1). Nothing is exposed beyond host loopback.
NET         ?= host
GO_IMAGE    ?= golang:1.25-alpine
NODE_IMAGE  ?= node:22-alpine

.DEFAULT_GOAL := help
.PHONY: help require-engine image run up down logs dev \
        install build build-frontend build-backend run-native clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	 awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

require-engine:
	@if [ -z "$(ENGINE)" ]; then \
	  echo "error: no container engine found — install podman or docker (or set ENGINE=)"; exit 1; fi

## ---- Containerized (default) ------------------------------------------------

image: require-engine ## Build the container image ($(IMAGE):$(TAG)) with $(ENGINE)
	$(ENGINE) build -t $(IMAGE):$(TAG) -t $(IMAGE):latest --build-arg VERSION=$(VERSION) $(ROOT)

run: image ## Build + run the app in a container (http://127.0.0.1:$(CHEAT_PORT); Ctrl-C to stop)
	@echo ">> $(ENGINE) run --network $(NET)  ->  http://127.0.0.1:$(CHEAT_PORT)"
	$(ENGINE) run --rm --network $(NET) --name $(NAME) -e CHEAT_PORT=$(CHEAT_PORT) $(IMAGE):$(TAG)

up: image ## Build + run detached (use `make logs` / `make down`)
	$(ENGINE) run -d --rm --network $(NET) --name $(NAME) -e CHEAT_PORT=$(CHEAT_PORT) $(IMAGE):$(TAG)
	@echo ">> detached  ->  http://127.0.0.1:$(CHEAT_PORT)   (make logs | make down)"

down: require-engine ## Stop & remove the running container
	-$(ENGINE) rm -f $(NAME) 2>/dev/null

logs: require-engine ## Follow container logs
	$(ENGINE) logs -f $(NAME)

dev: require-engine ## Containerized dev: Vite HMR (:5173) + Go (:$(CHEAT_PORT)) on host net (Ctrl-C)
	@echo ">> dev containers — UI http://127.0.0.1:5173  ·  API http://127.0.0.1:$(CHEAT_PORT)  (Ctrl-C to stop)"
	@trap '$(ENGINE) rm -f $(NAME)-api $(NAME)-web >/dev/null 2>&1' INT TERM EXIT; \
	 $(ENGINE) run --rm --network $(NET) --name $(NAME)-api \
	   -v $(BACKEND):/src:z -v cheat-go-cache:/go -w /src \
	   -e CHEAT_PORT=$(CHEAT_PORT) -e GOFLAGS=-buildvcs=false \
	   $(GO_IMAGE) go run . & \
	 $(ENGINE) run --rm --network $(NET) --name $(NAME)-web \
	   -v $(FRONTEND):/app:z -v cheat-web-modules:/app/node_modules -w /app \
	   $(NODE_IMAGE) sh -c "npm install --no-audit --no-fund --silent && npm run dev" & \
	 wait

## ---- Native (no container) --------------------------------------------------

install: ## (native) Install frontend dependencies
	cd $(FRONTEND) && npm install

build-frontend: ## (native) Build the SPA (frontend/dist)
	cd $(FRONTEND) && npm ci && npm run build

build-backend: ## (native) Copy dist into the embed path and compile the binary
	rm -rf $(EMBED_DIST) && mkdir -p $(EMBED_DIST)
	cp -R $(FRONTEND)/dist/. $(EMBED_DIST)/
	cd $(BACKEND) && go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN) .

build: build-frontend build-backend ## (native) Build SPA + compile the single binary
	@echo ">> built $(BIN)"

run-native: ## (native) Run the compiled binary directly (127.0.0.1:$(CHEAT_PORT))
	CHEAT_PORT=$(CHEAT_PORT) $(BIN)

clean: ## Remove build artifacts + container image/volumes
	rm -f $(BIN)
	rm -rf $(FRONTEND)/dist
	git -C $(ROOT) checkout -- backend/dist/index.html 2>/dev/null || true
	find $(EMBED_DIST) -mindepth 1 ! -name index.html -delete 2>/dev/null || true
	-$(ENGINE) rm -f $(NAME) $(NAME)-api $(NAME)-web 2>/dev/null
	-$(ENGINE) rmi $(IMAGE):$(TAG) $(IMAGE):latest 2>/dev/null
	-$(ENGINE) volume rm cheat-go-cache cheat-web-modules 2>/dev/null
