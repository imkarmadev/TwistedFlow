# TwistedFlow

A visual flow engine. Build automations, API clients, HTTP servers, test suites, and system tools by wiring nodes on a canvas — then run them headlessly or compile to standalone binaries.

**Desktop app** (Tauri 2 + React 19 + Rust) + **CLI** (`twistedflow-cli run` / `twistedflow-cli build`).

---

## Features

### 23 Built-in Nodes

| Node | Category | Description |
|------|----------|-------------|
| **Start** | Flow Control | Entry point. Triggers execution. |
| **If/Else** | Flow Control | Boolean branching — true/false exec paths. |
| **Match** | Flow Control | Switch/case routing on any value. |
| **ForEach (Sequential)** | Flow Control | Iterates an array, runs body chain once per item in order. |
| **ForEach (Parallel)** | Flow Control | Iterates an array, runs all items concurrently. |
| **Try/Catch** | Flow Control | Error boundary — catches failures and routes to error path. |
| **EmitEvent** | Flow Control | Broadcasts a named event. Listeners fire in parallel. |
| **OnEvent** | Flow Control | Listens for a named event. |
| **Request** | HTTP | Fires HTTP calls. URL templates (`#{token}`), Zod response schema, status code output pin. |
| **Listen** | HTTP | Starts an HTTP server (process node — stays alive). |
| **Route Match** | HTTP | Matches incoming requests by method + path pattern. |
| **Send Response** | HTTP | Sends HTTP response back to client. |
| **BreakObject** | Data | Splits an object into one output pin per field. |
| **MakeObject** | Data | Assembles an object from named typed input pins. |
| **Convert** | Data | Type coercion (string/number/integer/boolean/JSON). |
| **Tap** | Data | Pass-through debug probe. Shows every value that flows through. |
| **Log** | Data | Exec-chain print sink. Writes to the console panel. |
| **EnvVar** | Variables | Reads a value from the active .env file. |
| **SetVariable** | Variables | Sets a runtime variable. |
| **GetVariable** | Variables | Reads a runtime variable. |
| **Print** | System | Writes to stdout (useful in CLI/binary mode). |
| **ShellExec** | System | Runs a shell command and captures output. |
| **FileRead** | System | Reads a file from disk. |
| **FileWrite** | System | Writes a file to disk. |
| **Sleep** | System | Pauses execution for a duration. |
| **Exit** | System | Exits the flow with a status code. |
| **Assert** | Testing | Asserts a condition is true (fails the flow if not). |
| **AssertType** | Testing | Asserts a value matches an expected type. |

### Two Edge Types

- **Exec edges** (white diamonds) — control flow. Determines run order.
- **Data edges** (colored circles) — typed values. Pin colors: string (pink), number (green), boolean (red), object (blue), array (purple).

### CLI + Compile to Binary

```bash
# Run a flow headlessly
twistedflow-cli run ./flows/main.flow.json -e API_KEY=abc123

# Compile a project to a standalone binary
twistedflow-cli build ~/my-project -o my-app --flow main --env prod
./my-app   # just runs, no args needed
```

The desktop app also has a **Build** button in the canvas toolbar that compiles via native save dialog.

### WASM Plugins

Custom nodes as WebAssembly modules. Write in Rust (or anything that compiles to WASM), drop in your project's `nodes/` folder or `~/.twistedflow/plugins/`.

A guest SDK (`twistedflow-plugin` crate) makes writing plugins straightforward.

### Folder-based Projects

No database. A project is just files on disk — git-friendly by default.

```
my-project/
├── twistedflow.toml     # project name
├── .env                 # default environment
├── .env.dev             # dev environment
├── .env.prod            # prod environment
├── flows/
│   └── main.flow.json
└── nodes/               # project WASM plugins
```

### Smart Canvas

- **Right-click** or **Space** to open the searchable node palette
- **Drag a pin to empty canvas** — palette opens filtered to compatible nodes, auto-wires on selection
- **Type-aware filtering** — dragging a number pin won't suggest Break Object (which needs an object)
- **Viewport persistence** — zoom/pan position saved per flow
- **Minimap** — toggle with **M** key

### Debugging

- **Tap nodes** show every value that passed through (inline on the canvas)
- **Log nodes** print to the **Console panel** (toggle with **`** backtick key)
- **Per-node status** — pending (grey), running (pulsing cyan), ok (green), error (red)
- **Last Response viewer** in the inspector
- **Stop button** — halts execution at the next node boundary

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri 2](https://v2.tauri.app/) |
| Execution | Rust (async, pure — no Tauri dependency) |
| HTTP | [reqwest](https://github.com/seanmonstar/reqwest) |
| WASM runtime | [wasmtime](https://wasmtime.dev/) 29 |
| Frontend | React 19 + [Vite 6](https://vitejs.dev/) |
| Canvas | [@xyflow/react](https://reactflow.dev/) v12 |
| Monorepo | [Turbo](https://turbo.build/) + [Bun](https://bun.sh/) |

### Monorepo Structure

```
TwistedFlow/
├── apps/
│   ├── desktop/                    # Tauri desktop app
│   │   ├── src-tauri/              # Rust workspace
│   │   │   ├── src/                # Tauri app (project.rs, executor_commands.rs, http.rs)
│   │   │   └── crates/
│   │   │       ├── twistedflow-engine/   # Pure async executor, graph, templates, WASM host
│   │   │       ├── twistedflow-nodes/    # 23 built-in node implementations (#[node] macro)
│   │   │       ├── twistedflow-macros/   # #[node] proc macro + inventory auto-registration
│   │   │       ├── twistedflow-cli/      # CLI binary (run + build)
│   │   │       └── twistedflow-plugin/   # Guest SDK for WASM plugin authors
│   │   └── src/mainview/           # React frontend
│   │       ├── components/canvas/  # Node renderers + flow canvas
│   │       ├── components/inspector/ # Property editor
│   │       ├── components/console/ # Log panel
│   │       ├── components/settings/ # Project settings
│   │       └── lib/                # Pin system, schema resolution, node registry
│   └── web/                        # Landing page
├── packages/
│   ├── core/                       # JS utilities (pin helpers, template parser, schema tools)
│   └── shared/                     # Shared TypeScript types
├── examples/                       # Importable .flow.json files
└── scripts/                        # Release tooling
```

---

## Getting Started

### Prerequisites

- **macOS** or **Linux** (Windows not yet supported)
- [Bun](https://bun.sh/) >= 1.2
- [Rust](https://rustup.rs/) >= 1.77
- Xcode Command Line Tools on macOS (`xcode-select --install`)

### Install + Run

```bash
git clone https://github.com/imkarmadev/TwistedFlow.git
cd TwistedFlow
bun install

cd apps/desktop
bun run dev
```

First Rust compile takes ~30s. Subsequent rebuilds are <5s.

### Run Tests

```bash
bun run test              # all packages via Turbo
cd packages/core && bun test   # just core JS tests
```

### Build for Release

```bash
cd apps/desktop
bun run build
```

Produces a `.app` bundle in `src-tauri/target/release/bundle/`.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Right-click** | Open node palette at cursor |
| **Space** | Open node palette at center |
| **`** (backtick) | Toggle console panel |
| **M** | Toggle minimap |
| **Backspace / Delete** | Delete selected node or edge |
| **Cmd+Z / Cmd+Shift+Z** | Undo / Redo |

---

## License

MIT
