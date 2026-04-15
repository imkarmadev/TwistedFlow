# Changelog

All notable changes to TwistedFlow are documented here.

## [1.2.0] — 2026-04-14

### Added — REST API Server Nodes (10 new nodes)
- **Route** — Multi-route dispatcher with path parameter extraction (`/users/:id`) and query string parsing. Replaces cascading Route Match + If/Else chains with a single branch node.
- **Parse Body** — Parse request body as JSON, form-urlencoded, or text. Auto-detects Content-Type from headers.
- **Set Headers** — Build response headers from key-value pairs with `#{template}` support. Wire into Send Response's new `in:headers` pin.
- **CORS** — Handle CORS preflight (OPTIONS → 204) and inject Access-Control-* headers. Branches preflight/request.
- **Verify Auth** — Validate JWT (HS256 with expiry check), API key, Basic auth, or Bearer tokens. Outputs extracted claims. Branches pass/fail.
- **Rate Limit** — In-memory sliding window rate limiter with per-key tracking (IP, header, or custom key). Outputs X-RateLimit-* headers.
- **Cookie** — Parse incoming Cookie header into name-value object, or build Set-Cookie response headers with HttpOnly/Secure/SameSite attributes.
- **Redirect** — Send HTTP redirect responses (301/302/307/308) with Location header.
- **Serve Static** — Serve files from disk with automatic MIME type detection (25+ types), path traversal protection, and index file support.
- **Route Match** deprecated in favor of Route node.

### Enhanced
- **Send Response** — Added `in:headers` input pin for dynamic header composition. CORS, Cookie, Set Headers, and Rate Limit nodes can now wire headers directly into responses.
- **HTTP Request** — Added `out:responseTime` (ms) and `out:responseHeaders` (object) output pins for API testing and performance assertions.

### Total: 46 built-in nodes (was 36)

---

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
