// Command cheat is the single-binary backend for the Cheat app (M0 scaffold).
//
// It embeds the built Vite SPA (frontend/dist) and serves it same-origin
// alongside a minimal JSON API, plus GET /api/health and a history/SPA
// fallback to index.html.
//
// Networking: the listen host defaults to 0.0.0.0 (all interfaces — LAN
// exposed) and can be overridden with the --host flag or the CHEAT_HOST env
// (e.g. CHEAT_HOST=127.0.0.1 to restore loopback-only). The port defaults to
// 8787 (--port / CHEAT_PORT, SPEC Q195); a bind clash fails loudly.
// NOTE: there is NO auth and NO TLS — binding 0.0.0.0 exposes the entire
// (cleartext) dataset to anyone who can reach the port. This intentionally
// overrides the loopback-only posture of SPEC R1/Q168.
package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// version is the embedded build version, overridable at link time via
// -ldflags "-X main.version=<v>" (SPEC Q194). No auto-update / update ping.
var version = "0.0.0-dev"

// defaultPort is the fixed default loopback port (SPEC Q195).
const defaultPort = "8787"

// defaultDBPath is the SQLite path used when CHEAT_DB is unset. In the container
// this is overridden to a persistent volume (see Makefile CHEAT_DB=/data/...).
const defaultDBPath = "./cheat.db"

// devPlaceholderSentinel marks the committed placeholder index.html. A real
// `vite build` produces an index.html without this marker, so its presence
// tells the binary it was built without a real SPA (dev / standalone build)
// and it should serve the "run the Vite dev server" page instead.
const devPlaceholderSentinel = "CHEAT_DEV_PLACEHOLDER"

// distFS embeds the built SPA. go:embed patterns cannot traverse ".." , so the
// SPA lives in a `dist/` directory local to this package; the Makefile /
// Dockerfile copy frontend/dist into it before `go build`. A committed
// placeholder dist/index.html guarantees this compiles standalone.
//
//go:embed all:dist
var distFS embed.FS

func main() {
	portFlag := flag.String("port", "", "port to listen on (overrides CHEAT_PORT; default "+defaultPort+")")
	hostFlag := flag.String("host", "", "host/interface to bind (overrides CHEAT_HOST; default 0.0.0.0 — all interfaces)")
	flag.Parse()

	port := resolvePort(*portFlag)
	addr := resolveHost(*hostFlag) + ":" + port

	// Open the persistence DB first; a missing/unopenable DB is fatal (fail loud).
	db := mustOpenDB(resolveDBPath())

	spa, realSPA := loadSPA()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	// Minimal access log: method, path, status, latency only — never bodies,
	// query params, or bound SQL params (SPEC Q178, OPSEC).
	r.Use(gin.LoggerWithFormatter(minimalLogFormatter))

	// All /api routes are registered BEFORE the SPA fallback so /api/* never
	// falls through to index.html.
	api := r.Group("/api")
	api.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "version": version})
	})
	registerAPI(api, db)

	if realSPA {
		serveSPA(r, spa)
	} else {
		serveDevPlaceholder(r)
	}

	log.Printf("cheat %s — serving on http://%s%s", version, addr, spaStatus(realSPA))
	if err := r.Run(addr); err != nil {
		log.Fatalf("cheat: failed to bind %s: %v", addr, err)
	}
}

// resolve picks a config value: the raw flag value (if non-empty), then the
// trimmed env var at envKey (if non-empty), then def.
func resolve(flagVal, envKey, def string) string {
	if flagVal != "" {
		return flagVal
	}
	if env := strings.TrimSpace(os.Getenv(envKey)); env != "" {
		return env
	}
	return def
}

// resolveHost picks the listen host: --host flag, then CHEAT_HOST env, then
// 0.0.0.0 (all interfaces). Set CHEAT_HOST=127.0.0.1 for loopback-only.
func resolveHost(flagVal string) string {
	return resolve(flagVal, "CHEAT_HOST", "0.0.0.0")
}

// resolvePort picks the listen port: --port flag, then CHEAT_PORT env, then
// the fixed default (SPEC Q195).
func resolvePort(flagVal string) string {
	return resolve(flagVal, "CHEAT_PORT", defaultPort)
}

// resolveDBPath picks the SQLite path: CHEAT_DB env, then the fixed default.
func resolveDBPath() string {
	return resolve("", "CHEAT_DB", defaultDBPath)
}

// loadSPA returns the embedded SPA filesystem (rooted at dist/) and whether it
// is a real build (true) or only the committed dev placeholder (false).
func loadSPA() (fs.FS, bool) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatalf("cheat: cannot open embedded dist: %v", err)
	}
	index, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		log.Fatalf("cheat: embedded dist/index.html missing: %v", err)
	}
	return sub, !strings.Contains(string(index), devPlaceholderSentinel)
}

// serveSPA wires the embedded SPA: static assets are served from the embed FS,
// and any other non-/api GET falls back to index.html (SPA history routing).
func serveSPA(r *gin.Engine, spa fs.FS) {
	fileServer := http.FileServer(http.FS(spa))
	r.NoRoute(func(c *gin.Context) {
		req := c.Request
		if req.Method != http.MethodGet && req.Method != http.MethodHead {
			c.Status(http.StatusNotFound)
			return
		}
		if strings.HasPrefix(req.URL.Path, "/api") {
			c.Status(http.StatusNotFound)
			return
		}
		clean := strings.TrimPrefix(req.URL.Path, "/")
		if f, err := spa.Open(clean); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(c.Writer, req)
			return
		}
		// Unknown non-/api path → SPA history fallback.
		serveFile(c, spa, "index.html")
	})
}

// serveFile writes a single embedded file (used for the SPA index fallback).
func serveFile(c *gin.Context, spa fs.FS, name string) {
	data, err := fs.ReadFile(spa, name)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", data)
}

// serveDevPlaceholder serves an informational page for every non-/api GET when
// the binary was built without a real SPA (only the placeholder is embedded).
func serveDevPlaceholder(r *gin.Engine) {
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(devPlaceholderPage))
	})
}

func spaStatus(realSPA bool) string {
	if realSPA {
		return ""
	}
	return "  (no SPA embedded — run `make dev` / the Vite dev server on :5173)"
}

// minimalLogFormatter logs only method, path, status and latency (SPEC Q178).
func minimalLogFormatter(p gin.LogFormatterParams) string {
	return "[cheat] " + p.TimeStamp.Format("15:04:05") + " " +
		p.Method + " " + p.Path + " " +
		http.StatusText(p.StatusCode) + " " +
		p.Latency.String() + "\n"
}

const devPlaceholderPage = `<!doctype html>
<!-- CHEAT_DEV_PLACEHOLDER -->
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cheat — dev</title>
<style>
  body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0e0f13;color:#e6e8ee;
       margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{max-width:560px;padding:2rem 2.25rem;border:1px solid #2a2d36;background:#15171d}
  h1{color:#3ddc97;font-size:1.1rem;margin:0 0 .75rem;letter-spacing:.02em}
  p{line-height:1.5;color:#a5a9b5;margin:.4rem 0}
  code{background:#0e0f13;border:1px solid #2a2d36;padding:.15rem .4rem;color:#e6e8ee}
</style>
</head>
<body>
  <div class="card">
    <h1>Cheat — SPA non embarquée</h1>
    <p>Le binaire Go tourne, mais aucun build front n'est embarqué (placeholder seulement).</p>
    <p>En développement, lance le serveur Vite&nbsp;: <code>make dev</code> puis ouvre
       <code>http://127.0.0.1:5173</code> (le proxy <code>/api</code> pointe vers ce serveur).</p>
    <p>Pour un binaire complet&nbsp;: <code>make build</code> puis <code>./cheat</code>.</p>
    <p>API santé&nbsp;: <code>GET /api/health</code></p>
  </div>
</body>
</html>`
