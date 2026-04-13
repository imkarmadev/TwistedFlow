# Changelog

All notable changes to TwistedFlow are documented here.

## [1.0.0] — 2026-04-11

### Highlights

TwistedFlow is now a **general-purpose visual flow engine** — not just a REST tool. Build API clients, HTTP servers, system automations, test suites, and compile them to standalone binaries.

### Added — Rust Executor
- **Full Rust execution engine** (`twistedflow-engine`) — pure async, zero Tauri dependency
- **#[node] proc macro** — auto-registers nodes via inventory. Write a struct + implement execute, done.
- **5 Rust crates**: engine, nodes, macros, CLI, plugin SDK
- **Process nodes** — long-running nodes (like HTTP Listen) that stay alive in a task registry until cancelled

### Added — CLI
- `twistedflow-cli run <flow.json>` — run flows headlessly with env vars, base URL, quiet mode
- `twistedflow-cli build <project> -o <binary>` — compile a flow + env into a standalone binary
- **Build button** in desktop app canvas toolbar — compiles via native save dialog

### Added — WASM Plugins
- **wasmtime 29** runtime for loading custom node plugins
- Plugin loading from `~/.twistedflow/plugins/` + `{project}/nodes/`
- `twistedflow-plugin` guest SDK for plugin authors

### Added — Folder-based Projects
- **No more SQLite** — projects are plain folders on disk
- `twistedflow.toml` + `.env` files + `flows/` directory
- Git-friendly by default — everything is just files
- Environments are `.env` files (standard dotenv format)

### Added — New Nodes (23 total)
- **Flow Control**: Start, If/Else, Match, ForEachSeq, ForEachPar, Try/Catch, EmitEvent, OnEvent
- **HTTP**: Request, Listen (process), Route Match, Send Response
- **Data**: BreakObject, MakeObject, Convert, Tap, Log
- **Variables**: EnvVar, SetVariable, GetVariable
- **System**: Print, ShellExec, FileRead, FileWrite, Sleep, Exit
- **Testing**: Assert, AssertType

### Changed
- Execution moved from JavaScript to Rust (async, cancellable, process-aware)
- Persistence moved from SQLite to folder-based projects
- Removed base URL / headers / auth from project settings — handled via nodes (EnvVar, SetVariable)
- Removed all third-party branding references

### Infrastructure
- **Tauri 2** + Rust backend with reqwest (direct HTTP, no JS bridge)
- **React 19** + Vite 6 + @xyflow/react v12
- **Monorepo** — Turbo + Bun workspaces
- **CI/CD** — GitHub Actions builds for macOS (ARM + Intel) + Linux (x64)
- **Automated releases** — `bun run release patch/minor/major`

---

## [0.2.0] — 2026-04-09

### Added
- **14 node types**: Start, HTTP Request, Match, ForEach (Sequential), ForEach (Parallel), Emit Event, On Event, Env Var, Break Object, Make Object, Convert, Function, Tap, Log
- **Visual node canvas** with exec edges (white diamonds) and data edges (colored circles)
- **Searchable node palette** — right-click, Space, or drag-to-canvas with type-aware filtering
- **Environments** with per-env base URL, headers, variables, and auth
- **Authentication** — Bearer, Basic, API Key (header/query), OAuth2 Client Credentials, OAuth2 Authorization Code
- **Match node** — switch/case routing on any value
- **Event system** — Emit/On Event for decoupled pub/sub
- **Console panel** — bottom log viewer
- **Inspector** — property editor with Zod schema validation, "From JSON" inference, "Use response as schema" auto-fix
- **Import/Export** — flows as .flow.json files
- **Stop button** — abort running flow at next node boundary
- **Viewport persistence** — zoom/pan saved per flow
- **Minimap** — toggle with M key
- **Update checker** — notifies when a new GitHub release is available

### Infrastructure
- Tauri 2 + Rust backend with reqwest + rusqlite (JS executor)
- React 19 + Vite 6 + React Flow v12
- Monorepo — Turbo + Bun workspaces
- CI/CD — GitHub Actions
- Automated releases
- 64 unit tests covering executor, templates, schema walker
- Rebranded from ApiFlow to TwistedFlow

## [0.1.0] — 2026-04-08

### Added
- Initial prototype with Electrobun (later migrated to Tauri)
- Basic canvas with Start and HTTP Request nodes
- SQLite persistence via bun:sqlite (later migrated to rusqlite)
