# Cheat — container-only build & delivery.
# The app runs exclusively through a container engine (podman preferred, docker
# fallback). Typical loop:  make down && make build && make up   (or: make rebuild)
# The server binds 0.0.0.0 and is published on the LAN (no host networking).

SHELL       := /bin/bash
ROOT        := $(CURDIR)
FRONTEND    := $(ROOT)/frontend
BACKEND     := $(ROOT)/backend
VERSION     ?= 0.0.0-dev
CHEAT_PORT  ?= 8787

# Container engine: prefer podman, fall back to docker.
ENGINE      ?= $(shell if command -v podman >/dev/null 2>&1; then echo podman; elif command -v docker >/dev/null 2>&1; then echo docker; fi)
IMAGE       ?= cheat
TAG         ?= $(VERSION)
NAME        ?= cheat
# LAN-exposed (intentionally overrides the SPEC R1/Q168 loopback-only posture):
# a normal bridge network with the port PUBLISHed on 0.0.0.0, and the server
# binds 0.0.0.0 inside the container (CHEAT_HOST). No `--network host`.
# WARNING: there is NO auth and NO TLS — anyone able to reach the host on
# CHEAT_PORT gets full read/write access to the (cleartext) dataset. To restore
# loopback-only: make up CHEAT_HOST=127.0.0.1 PUBLISH='-p 127.0.0.1:$(CHEAT_PORT):$(CHEAT_PORT)'
CHEAT_HOST  ?= 0.0.0.0
PUBLISH     ?= -p 0.0.0.0:$(CHEAT_PORT):$(CHEAT_PORT)
DEV_NET     ?= $(NAME)-dev
GO_IMAGE    ?= golang:1.25-alpine
NODE_IMAGE  ?= node:22-alpine

.DEFAULT_GOAL := help
.PHONY: help require-engine build up run down rebuild logs dev clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	 awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'

require-engine:
	@if [ -z "$(ENGINE)" ]; then \
	  echo "error: no container engine found — install podman or docker (or set ENGINE=)"; exit 1; fi

build: require-engine ## Build the container image ($(IMAGE):$(TAG)) with $(ENGINE)
	$(ENGINE) build -t $(IMAGE):$(TAG) -t $(IMAGE):latest --build-arg VERSION=$(VERSION) $(ROOT)

# Persist the SQLite DB in a named volume so it survives container restarts.
# `:U` makes podman chown the volume to the (nonroot) container user. Docker does
# NOT support `:U` — Docker users should swap this for a bind mount they own,
# e.g. `-v $(ROOT)/data:/data -e CHEAT_DB=/data/cheat.db` (host dir writable).
DB_VOL      ?= -v cheat-data:/data:U -e CHEAT_DB=/data/cheat.db

up: require-engine ## Run the built image, detached (published on 0.0.0.0:$(CHEAT_PORT), LAN-exposed)
	$(ENGINE) run -d --rm $(PUBLISH) --name $(NAME) -e CHEAT_HOST=$(CHEAT_HOST) -e CHEAT_PORT=$(CHEAT_PORT) $(DB_VOL) $(IMAGE):$(TAG)
	@echo ">> up  ->  http://0.0.0.0:$(CHEAT_PORT)  (LAN-exposed — no auth/TLS)   (make logs | make down)"

run: require-engine ## Run the built image in the foreground (Ctrl-C to stop)
	@echo ">> $(ENGINE) run $(PUBLISH)  ->  http://0.0.0.0:$(CHEAT_PORT)  (LAN-exposed — no auth/TLS)"
	$(ENGINE) run --rm $(PUBLISH) --name $(NAME) -e CHEAT_HOST=$(CHEAT_HOST) -e CHEAT_PORT=$(CHEAT_PORT) $(DB_VOL) $(IMAGE):$(TAG)

down: require-engine ## Stop & remove the running container
	-$(ENGINE) rm -f $(NAME) 2>/dev/null

rebuild: ## down + build + up (the usual one-shot)
	@$(MAKE) --no-print-directory down
	@$(MAKE) --no-print-directory build
	@$(MAKE) --no-print-directory up

logs: require-engine ## Follow container logs
	$(ENGINE) logs -f $(NAME)

dev: require-engine ## Containerized dev: Vite HMR (:5173) + Go (:$(CHEAT_PORT)), bridge net, published on 0.0.0.0 (Ctrl-C)
	@echo ">> dev containers — UI http://0.0.0.0:5173  ·  API http://0.0.0.0:$(CHEAT_PORT)  (LAN-exposed, Ctrl-C to stop)"
	@$(ENGINE) network create $(DEV_NET) >/dev/null 2>&1 || true
	@trap '$(ENGINE) rm -f $(NAME)-api $(NAME)-web >/dev/null 2>&1; $(ENGINE) network rm $(DEV_NET) >/dev/null 2>&1' INT TERM EXIT; \
	 $(ENGINE) run --rm --network $(DEV_NET) --name $(NAME)-api \
	   -p 0.0.0.0:$(CHEAT_PORT):$(CHEAT_PORT) \
	   -v $(BACKEND):/src:z -v cheat-go-cache:/go -w /src \
	   -e CHEAT_HOST=0.0.0.0 -e CHEAT_PORT=$(CHEAT_PORT) -e GOFLAGS=-buildvcs=false \
	   $(GO_IMAGE) go run . & \
	 $(ENGINE) run --rm --network $(DEV_NET) --name $(NAME)-web \
	   -p 0.0.0.0:5173:5173 \
	   -v $(FRONTEND):/app:z -v cheat-web-modules:/app/node_modules -w /app \
	   -e VITE_API_TARGET=http://$(NAME)-api:$(CHEAT_PORT) \
	   $(NODE_IMAGE) sh -c "npm install --no-audit --no-fund --silent && npm run dev" & \
	 wait

clean: require-engine ## Remove the container, image, dev volumes and dev network
	-$(ENGINE) rm -f $(NAME) $(NAME)-api $(NAME)-web 2>/dev/null
	-$(ENGINE) rmi $(IMAGE):$(TAG) $(IMAGE):latest 2>/dev/null
	-$(ENGINE) volume rm cheat-go-cache cheat-web-modules cheat-data 2>/dev/null
	-$(ENGINE) network rm $(DEV_NET) 2>/dev/null
