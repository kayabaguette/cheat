# Cheat — build & delivery (M0 scaffold).
# Single self-contained Go binary embedding the Vite SPA, served on 127.0.0.1.

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

.PHONY: dev install build build-frontend build-backend run clean docker help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	 awk 'BEGIN{FS=":.*?## "}{printf "  %-16s %s\n", $$1, $$2}'

install: ## Install frontend dependencies
	cd $(FRONTEND) && npm install

dev: ## Run Go backend (:$(CHEAT_PORT)) + Vite dev server (:5173) together
	@echo ">> starting Go backend on 127.0.0.1:$(CHEAT_PORT) and Vite on :5173 (Ctrl-C to stop)"
	@trap 'kill 0' INT TERM EXIT; \
	 ( cd $(BACKEND) && CHEAT_PORT=$(CHEAT_PORT) go run . ) & \
	 ( cd $(FRONTEND) && npm run dev ) & \
	 wait

build-frontend: ## Build the SPA (frontend/dist)
	cd $(FRONTEND) && npm ci && npm run build

build-backend: ## Copy dist into the embed path and compile the binary
	rm -rf $(EMBED_DIST)
	mkdir -p $(EMBED_DIST)
	cp -R $(FRONTEND)/dist/. $(EMBED_DIST)/
	cd $(BACKEND) && go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN) .

build: build-frontend build-backend ## Build SPA then compile the embedded single binary
	@echo ">> built $(BIN)"

run: ## Run the compiled binary (127.0.0.1:$(CHEAT_PORT))
	CHEAT_PORT=$(CHEAT_PORT) $(BIN)

docker: ## Build the multi-stage Docker image (tag: cheat:$(VERSION))
	docker build -t cheat:$(VERSION) --build-arg VERSION=$(VERSION) $(ROOT)

clean: ## Remove build artifacts (binary, dist, embed placeholder assets)
	rm -f $(BIN)
	rm -rf $(FRONTEND)/dist
	git -C $(ROOT) checkout -- backend/dist/index.html 2>/dev/null || true
	find $(EMBED_DIST) -mindepth 1 ! -name index.html -delete 2>/dev/null || true
