# Architecture

This document covers how TwistedFlow is built, how the pieces fit together, and where to find things. It's written for maintainers and contributors.

---

## Overview

TwistedFlow is a visual flow engine: users wire nodes on a canvas in a desktop app, then run them locally or compile to standalone binaries via CLI.

```
┌──────────────────────────────────────────────────┐
│              Desktop App (Tauri 2)                │
│  ┌────────────┐         ┌──────────────────────┐ │
│  │  React 19  │ invoke  │    Rust Backend       │ │
│  │  webview   │◄───────►│  (project I/O, HTTP)  │ │
│  │  (canvas,  │ events  │         │              │ │
│  │  inspector)│         │         ▼              │ │
│  └────────────┘         │  twistedflow-engine    │ │
│                         │  (executor, graph,     │ │
│                         │   templates, WASM)     │ │
│                         └──────────────────────┘ │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│              CLI (twistedflow-cli)                │
│  twistedflow-cli run  ──► twistedflow-engine     │
│  twistedflow-cli build ──► compile to binary     │
└──────────────────────────────────────────────────┘
```

The engine crate has **zero Tauri dependency** — it's shared between the desktop app and the CLI.

---

## Rust Crates

All Rust code lives under `apps/desktop/src-tauri/`. The workspace contains 6 members:

### `twistedflow` (the Tauri app)

Entry point for the desktop app. Thin shell that wires Tauri to the engine.

| File | Role |
|------|------|
| `src/project.rs` | Folder-based project I/O (create, open, save flows, manage .env files) |
| `src/executor_commands.rs` | Tauri commands: `run_flow`, `stop_flow`. Bridges engine to frontend via events. |
| `src/http.rs` | reqwest HTTP transport + OAuth2 token management |
| `src/commands.rs` | Other Tauri commands (file dialogs, updates, etc.) |
| `src/db.rs` | Legacy — was SQLite, now unused but kept for migration reference |

### `twistedflow-engine`

The heart. Pure async Rust executor with no framework dependency.

| Module | Role |
|--------|------|
| `executor.rs` | DAG walker. Starts at the Start node, follows exec edges, resolves data pins lazily, streams status events. |
| `graph.rs` | `FlowFile` → `GraphIndex` builder. Indexes nodes/edges for O(1) lookup by ID, exec/data neighbors. |
| `flow_file.rs` | Deserializes `.flow.json` files into `FlowFile` structs (nodes, edges, variables, viewport). |
| `template.rs` | `#{token}` template parser and renderer. Extracts input pin references from node config strings. |
| `node.rs` | `Node` trait, `DataType` enum, `ExecContext`, `StatusEvent`, `LogEntry`, pin definitions, registry builder. |
| `wasm_host.rs` | wasmtime 29 host. Loads `.wasm` plugins from disk, wraps them as `Node` trait objects. |

**Key types:**
- `RunFlowOpts` — everything the executor needs: graph index, context, callbacks, HTTP client, registry, cancellation token
- `NodeResult::Done` vs `NodeResult::Process` — done nodes complete immediately; process nodes spawn a long-running task
- `Outputs` = `HashMap<NodeId, HashMap<PinId, Value>>` — the data cache, filled lazily as nodes execute
- `GraphIndex` — pre-built indexes for fast traversal (exec neighbors, data sources, etc.)

### `twistedflow-nodes`

23 built-in node implementations. Each node is a struct with the `#[node]` attribute macro:

```rust
#[node(
    name = "Log",
    type_id = "log",
    category = "Data",
    description = "Log a value to the console",
)]
struct LogNode;

#[async_trait]
impl Node for LogNode {
    async fn execute(&self, ctx: &mut NodeCtx<'_>) -> Result<NodeResult, String> {
        // ...
    }
}
```

The `#[node]` macro generates metadata + `inventory::submit!` for auto-registration. No manual registry — just add a file and `mod` it in `lib.rs`.

### `twistedflow-macros`

The `#[node]` proc macro crate. Parses `name`, `type_id`, `category`, `description` attributes and generates:
- `impl NodeMeta for T` — returns static `NodeMetadata`
- `inventory::submit!(NodeRegistration { ... })` — auto-discovered at startup

### `twistedflow-cli`

CLI binary with two subcommands:

- **`run`** — loads a `.flow.json`, builds the graph, runs the executor headlessly. Supports `--env KEY=VAL`, `--base-url`, `--quiet`, `--plugins`.
- **`build`** — compiles a project (folder with `twistedflow.toml`) into a standalone binary. Embeds the flow JSON + env vars, generates a `main.rs` wrapper, runs `cargo build`.

### `twistedflow-plugin`

Guest SDK for WASM plugin authors. Provides the declarative `nodes!` macro, typed `PluginInputs` / `PluginOutputs` builders, and `host::log` callback. No trait to implement — the macro generates the ABI exports.

---

## Execution Model

### Flow of a Run

1. Frontend calls `invoke("run_flow")` with flow JSON + context (env vars, base URL, headers, auth)
2. Rust deserializes into `FlowFile`, builds `GraphIndex`
3. `build_registry()` collects all `#[node]` implementations via `inventory`
4. WASM plugins loaded from disk, added to registry
5. **Variable pre-seeding**: if the flow declares a `variables` array, each variable's default value is written into the runtime variable store before execution begins
6. Executor finds Start node, marks all nodes as pending
7. **Chain walking**: follows exec edges sequentially. At each node:
   - Resolve input data pins by walking backward through data edges (lazy — only computed when needed)
   - Call `node.execute(ctx)` from the registry
   - Store outputs in the shared `Outputs` map
   - Emit status event to frontend
   - Follow the next exec edge
8. **Branching**: If/Else, Match, Try/Catch route to different exec edges based on conditions
9. **Looping**: ForEach nodes recurse into body sub-chains (sequential or parallel via `tokio::join_all`)
10. **Events**: EmitEvent finds all OnEvent listeners by name, spawns their chains concurrently
11. **Process nodes**: Return `NodeResult::Process` — spawned as a separate tokio task that lives until cancellation

### Data Resolution

Data pins are **pull-based**. When node B needs input from node A:
1. Executor traces the data edge backward from B's input pin to A's output pin
2. If A has already executed, reads from `Outputs` cache
3. If A is a pure-data node (Convert, BreakObject, Tap, EnvVar), executes it on-demand and caches
4. Templates (`#{token}`) in node config are resolved the same way

### Process Nodes

Some nodes (HTTP Listen) need to stay alive beyond their exec chain. These return `NodeResult::Process` and are tracked in a separate process registry. They run until:
- The user clicks Stop
- The flow completes and cleanup runs
- `CancellationToken` is cancelled

---

## Frontend Architecture

### React App (`apps/desktop/src/mainview/`)

Single-page app rendered in Tauri's webview. No router — it's a single canvas view with overlays.

| Directory | Role |
|-----------|------|
| `components/canvas/` | React Flow canvas, node components (one `.tsx` per node type), edge renderers, palette |
| `components/inspector/` | Right-side property editor — context-sensitive per selected node type |
| `components/console/` | Bottom log panel, toggle with backtick |
| `components/settings/` | Project settings modal (name, environments) |
| `components/layout/` | Sidebar (flow list), title bar |
| `components/editor/` | Code editor component |
| `lib/` | Shared logic — pin system, schema resolution, node registry, etc. |

### Pin System

Every node declares its pins via `compute*Pins()` functions in `lib/node-pins.ts`. Pins have:
- `id` — handle identifier (e.g. `in:userId`, `out:name`, `exec-in`)
- `kind` — `exec` or `data`
- `direction` — `in` or `out`
- `dataType` — `string | number | boolean | object | array | unknown`

Schema resolution (`lib/schema-resolution.ts`) walks backward through the graph to introspect pin types at design time — used by BreakObject (auto-generate sub-pins from objects, including Get Variable nodes with declared object types), Convert (filter valid targets), and the palette (filter compatible nodes on pin-drop).

### Communication with Rust

- `invoke("run_flow", { ... })` — start execution
- `invoke("stop_flow")` — cancel via CancellationToken
- `listen("flow:status")` — per-node status updates (pending/running/ok/error)
- `listen("flow:log")` — log entries from Log/Print nodes
- `invoke("save_flow", { ... })` / `invoke("load_project", { ... })` — project I/O

### JS Packages

- **`@twistedflow/core`** — `pinsFromSchema`, `parseTemplate`, `inputPinsFor`, Zod schema eval. Used for canvas rendering only, **not execution**.
- **`@twistedflow/shared`** — shared TypeScript types.

---

## Project Model

Projects are folders. No database.

```
my-project/
├── twistedflow.toml      # name = "My Project"
├── .env                   # default environment
├── .env.dev               # dev environment
├── .env.prod              # prod environment
├── flows/
│   ├── main.flow.json     # flow definitions (nodes, edges, viewport)
│   └── health-check.flow.json
└── nodes/                 # project-scoped WASM plugins
    └── my-custom-node.wasm
```

- **Environments** = `.env` files in standard dotenv format
- **Flows** = JSON files with nodes array, edges array, optional `variables` array (typed declarations with defaults), and viewport position
- **Plugins** = `.wasm` files in `nodes/` (project-scoped) or `~/.twistedflow/plugins/` (global)

---

## WASM Plugin System

Plugins extend TwistedFlow with custom node types distributed as `.wasm` files.

**Loading order:**
1. Global plugins from `~/.twistedflow/plugins/`
2. Project plugins from `{project}/nodes/`

**Runtime:** wasmtime 29. The engine's `wasm_host.rs` loads each `.wasm`, wraps it as a `Box<dyn Node>`, and adds it to the registry alongside built-in nodes.

**Writing plugins:** Use the `twistedflow-plugin` guest SDK with its declarative `nodes!` macro. Target `wasm32-wasip1`. Either run `twistedflow plugin new <name>` to scaffold + `twistedflow plugin build` to compile and install, or do it by hand with `cargo build --target wasm32-wasip1 --release` and manual copy. Host callbacks available: `host::log` routes to the console panel. See [docs/plugins.md](docs/plugins.md) for the full guide.

---

## Build System

### Development

```bash
bun install          # JS dependencies
cd apps/desktop
bun run dev          # Vite HMR + Cargo watch
```

### Release

```bash
bun run release patch   # bumps all versions, commits, tags, pushes
```

GitHub Actions picks up the tag and builds:
- macOS ARM (.app + .dmg)
- macOS Intel (.app + .dmg)
- Linux x64 (.AppImage + .deb)

### CLI Binary

The CLI is built as part of the Cargo workspace. `twistedflow-cli build` compiles flows into standalone binaries by generating a wrapper `main.rs` that embeds the flow JSON + env vars and links against `twistedflow-engine`.

---

## Design Principles

1. **UX over architecture** — if users have to think about plumbing, the abstraction is wrong. Direct pin wiring over indirection.
2. **Files, not databases** — projects are folders, environments are `.env` files, flows are JSON. Git-native.
3. **Rust for execution, JS for rendering** — the frontend only draws the canvas. All execution happens in Rust.
4. **Convention over configuration** — `#[node]` macro + inventory handles registration. Drop a file, add a `mod`, done.
5. **Ship the happy path** — get it working, fix edge cases as they come.
