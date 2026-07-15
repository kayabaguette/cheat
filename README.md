# Cheat

OSCP notes, cheatsheets & methodology workshop — a single-user, offline, **localhost-only** desktop web app that centralizes reusable **commands**, step-by-step **methodologies**, external **references**, and target-scoped **cheatsheets**, with live **variable** substitution (`$IP`, `$LHOST`, …) resolved identically wherever a command is shown.

- **Status:** Specification finalized — implementation not started.
- **Spec:** [`SPEC.md`](./SPEC.md) is authoritative.
- **Stack (planned):** Go + Gin + GORM + SQLite backend as a single binary embedding a Vite + React + TypeScript SPA (`go:embed`, same-origin REST API bound to `127.0.0.1`). **Zero network egress.** No sensitive data is written to disk (variable values are memory-only).
- **UI language:** French. In-repo documentation: English.

## Repository layout

- `SPEC.md` — final specification (12 sections + open items + traceability).
- `tasks/` — spec questionnaire (`spec-questions.md`), decisions log (`spec-decisions.md`), proposed adjustments (`spec-adjustments.md`), and implementation plan (`todo.md`).
