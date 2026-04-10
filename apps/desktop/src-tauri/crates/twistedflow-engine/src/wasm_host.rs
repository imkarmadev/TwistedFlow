//! WASM plugin host — loads `.wasm` files, discovers nodes, bridges to Node trait.
//!
//! Plugin ABI:
//! - `tf_metadata() -> *const u8` — returns length-prefixed JSON: `[{name, typeId, ...}, ...]`
//! - `tf_execute(type_id_ptr, type_id_len, inputs_ptr, inputs_len) -> *const u8` — returns length-prefixed JSON

use crate::node::{Node, NodeCtx, NodeMetadata, NodeResult};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use wasmtime::*;
use wasmtime_wasi::preview1::WasiP1Ctx;
use wasmtime_wasi::WasiCtxBuilder;

/// Pin definition from plugin metadata.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginPinDef {
    key: String,
    #[serde(default = "default_data_type")]
    data_type: String,
}

fn default_data_type() -> String {
    "unknown".to_string()
}

/// Node definition from plugin metadata.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginNodeDef {
    name: String,
    type_id: String,
    category: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    inputs: Vec<PluginPinDef>,
    #[serde(default)]
    outputs: Vec<PluginPinDef>,
}

/// A WASM-backed node that implements the Node trait.
pub struct WasmNode {
    engine: Engine,
    module: Module,
    type_id: String,
    #[allow(dead_code)]
    metadata: NodeMetadata,
    pub inputs: Vec<(String, String)>,  // (key, data_type)
    pub outputs: Vec<(String, String)>, // (key, data_type)
}

// SAFETY: wasmtime Engine and Module are Send + Sync
unsafe impl Send for WasmNode {}
unsafe impl Sync for WasmNode {}

impl Node for WasmNode {
    fn execute<'a>(
        &'a self,
        ctx: NodeCtx<'a>,
    ) -> Pin<Box<dyn Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            // 1. Resolve all inputs
            let inputs = ctx.resolve_all_inputs().await;
            let inputs_json = serde_json::to_string(&inputs).unwrap_or_else(|_| "{}".into());

            // 2. Run WASM on a blocking thread (WASM execution is synchronous)
            let engine = self.engine.clone();
            let module = self.module.clone();
            let type_id = self.type_id.clone();

            let result = tokio::task::spawn_blocking(move || {
                call_wasm_execute(&engine, &module, &type_id, &inputs_json)
            })
            .await;

            match result {
                Ok(Ok(output_json)) => {
                    // 3. Parse output JSON
                    match serde_json::from_str::<HashMap<String, Value>>(&output_json) {
                        Ok(output) => {
                            let output_val = serde_json::to_value(&output).ok();
                            ctx.set_outputs(output).await;
                            NodeResult::Continue { output: output_val }
                        }
                        Err(e) => NodeResult::Error {
                            message: format!("Plugin output parse error: {}", e),
                            raw_response: None,
                        },
                    }
                }
                Ok(Err(e)) => NodeResult::Error {
                    message: format!("Plugin execution error: {}", e),
                    raw_response: None,
                },
                Err(e) => NodeResult::Error {
                    message: format!("Plugin task error: {}", e),
                    raw_response: None,
                },
            }
        })
    }
}

/// Call tf_execute on a WASM module (synchronous, runs on blocking thread).
fn call_wasm_execute(
    engine: &Engine,
    module: &Module,
    type_id: &str,
    inputs_json: &str,
) -> Result<String, String> {
    let mut linker = Linker::<WasiP1Ctx>::new(engine);
    wasmtime_wasi::preview1::add_to_linker_sync(&mut linker, |ctx| ctx)
        .map_err(|e| format!("WASI linker error: {}", e))?;

    let wasi_ctx = WasiCtxBuilder::new().build_p1();
    let mut store = Store::new(engine, wasi_ctx);

    let instance = linker
        .instantiate(&mut store, module)
        .map_err(|e| format!("WASM instantiation error: {}", e))?;

    let memory = instance
        .get_memory(&mut store, "memory")
        .ok_or("No memory export")?;

    // Write type_id and inputs JSON to WASM memory using a bump allocator.
    // We write both buffers before calling tf_execute so they coexist in memory.
    let type_id_bytes = type_id.as_bytes();
    let inputs_bytes = inputs_json.as_bytes();

    // Ensure enough memory
    let needed = type_id_bytes.len() + inputs_bytes.len() + 8192;
    let mem_size = memory.data_size(&store);
    if mem_size < needed + 65536 {
        let pages = ((needed + 65536 - mem_size) / 65536) + 1;
        memory
            .grow(&mut store, pages as u64)
            .map_err(|e| format!("Memory grow failed: {}", e))?;
    }

    // Write at high offsets to avoid guest heap
    let base = memory.data_size(&store) - 8192;
    let type_id_ptr = base;
    let inputs_ptr = base + type_id_bytes.len() + 16; // pad

    memory.write(&mut store, type_id_ptr, type_id_bytes)
        .map_err(|e| format!("Memory write failed: {}", e))?;
    memory.write(&mut store, inputs_ptr, inputs_bytes)
        .map_err(|e| format!("Memory write failed: {}", e))?;

    // Call tf_execute
    let tf_execute = instance
        .get_typed_func::<(i32, i32, i32, i32), i32>(&mut store, "tf_execute")
        .map_err(|e| format!("tf_execute not found: {}", e))?;

    let result_ptr = tf_execute
        .call(
            &mut store,
            (
                type_id_ptr as i32,
                type_id_bytes.len() as i32,
                inputs_ptr as i32,
                inputs_bytes.len() as i32,
            ),
        )
        .map_err(|e| format!("tf_execute call failed: {}", e))?;

    // Read result (length-prefixed string)
    read_length_prefixed_string(&store, &memory, result_ptr as usize)
}

/// Read metadata from a WASM module.
fn read_wasm_metadata(engine: &Engine, module: &Module) -> Result<Vec<PluginNodeDef>, String> {
    let mut linker = Linker::<WasiP1Ctx>::new(engine);
    wasmtime_wasi::preview1::add_to_linker_sync(&mut linker, |ctx| ctx)
        .map_err(|e| format!("WASI linker error: {}", e))?;

    let wasi_ctx = WasiCtxBuilder::new().build_p1();
    let mut store = Store::new(engine, wasi_ctx);

    let instance = linker
        .instantiate(&mut store, module)
        .map_err(|e| format!("WASM instantiation error: {}", e))?;

    let memory = instance
        .get_memory(&mut store, "memory")
        .ok_or("No memory export")?;

    // Call tf_metadata
    let tf_metadata = instance
        .get_typed_func::<(), i32>(&mut store, "tf_metadata")
        .map_err(|e| format!("tf_metadata not found: {}", e))?;

    let ptr = tf_metadata
        .call(&mut store, ())
        .map_err(|e| format!("tf_metadata call failed: {}", e))?;

    let json = read_length_prefixed_string(&store, &memory, ptr as usize)?;
    let defs: Vec<PluginNodeDef> =
        serde_json::from_str(&json).map_err(|e| format!("Metadata parse error: {}", e))?;

    Ok(defs)
}

/// Read a length-prefixed string from WASM memory.
/// Format: [u32 LE length][utf-8 bytes]
fn read_length_prefixed_string(
    store: &Store<WasiP1Ctx>,
    memory: &Memory,
    ptr: usize,
) -> Result<String, String> {
    let data = memory.data(store);
    if ptr + 4 > data.len() {
        return Err("Pointer out of bounds".into());
    }
    let len = u32::from_le_bytes([data[ptr], data[ptr + 1], data[ptr + 2], data[ptr + 3]]) as usize;
    if ptr + 4 + len > data.len() {
        return Err(format!(
            "String length {} exceeds memory at offset {}",
            len, ptr
        ));
    }
    let bytes = &data[ptr + 4..ptr + 4 + len];
    String::from_utf8(bytes.to_vec()).map_err(|e| format!("UTF-8 error: {}", e))
}

/// Expand `~` to home directory.
fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        if let Some(home) = dirs_next_home() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Default plugin directory.
pub const DEFAULT_PLUGINS_DIR: &str = "~/.twistedflow/plugins";

/// Load all WASM plugins from the given directories.
/// Returns a vec of (leaked type_id str, Box<dyn Node>) pairs ready for the registry.
pub fn load_wasm_plugins(
    dirs: &[&str],
) -> Vec<(&'static str, Box<dyn Node>, NodeMetadata)> {
    let engine = Engine::default();
    let mut result = Vec::new();

    for dir in dirs {
        let expanded = expand_tilde(dir);
        let entries = match std::fs::read_dir(&expanded) {
            Ok(e) => e,
            Err(_) => continue, // directory doesn't exist — skip
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("wasm") {
                continue;
            }

            match load_single_wasm(&engine, &path) {
                Ok(nodes) => {
                    for (type_id, node, meta) in nodes {
                        log::info!(
                            "[wasm-plugins] loaded '{}' ({}) from {}",
                            meta.name,
                            type_id,
                            path.display()
                        );
                        result.push((type_id, node, meta));
                    }
                }
                Err(e) => {
                    log::warn!(
                        "[wasm-plugins] failed to load {}: {}",
                        path.display(),
                        e
                    );
                }
            }
        }
    }

    result
}

/// Load a single .wasm file and return all nodes it declares.
fn load_single_wasm(
    engine: &Engine,
    path: &Path,
) -> Result<Vec<(&'static str, Box<dyn Node>, NodeMetadata)>, String> {
    let wasm_bytes =
        std::fs::read(path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    let module =
        Module::new(engine, &wasm_bytes).map_err(|e| format!("WASM compile error: {}", e))?;

    let defs = read_wasm_metadata(engine, &module)?;

    let mut nodes = Vec::new();
    for def in defs {
        let metadata = NodeMetadata {
            name: def.name.clone(),
            type_id: def.type_id.clone(),
            category: def.category.clone(),
            description: def.description.clone(),
            inputs: def.inputs.iter().map(|p| crate::node::PinDef {
                key: p.key.clone(),
                data_type: p.data_type.clone(),
            }).collect(),
            outputs: def.outputs.iter().map(|p| crate::node::PinDef {
                key: p.key.clone(),
                data_type: p.data_type.clone(),
            }).collect(),
        };

        // Leak the type_id so it has 'static lifetime for the registry HashMap key.
        let type_id: &'static str = Box::leak(def.type_id.clone().into_boxed_str());

        let wasm_node = WasmNode {
            engine: engine.clone(),
            module: module.clone(),
            type_id: def.type_id,
            metadata: metadata.clone(),
            inputs: def.inputs.iter().map(|p| (p.key.clone(), p.data_type.clone())).collect(),
            outputs: def.outputs.iter().map(|p| (p.key.clone(), p.data_type.clone())).collect(),
        };

        nodes.push((type_id, Box::new(wasm_node) as Box<dyn Node>, metadata));
    }

    Ok(nodes)
}
